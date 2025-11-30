
import { GoogleGenAI, Type } from "@google/genai";
import { SyntaxType, CategoryDef, PromptTag, AIConfig } from "../types";
import { translateWithBaidu } from "./baiduService";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const modelName = "gemini-2.5-flash";

/**
 * Local Helper: Detect syntax type using Regex.
 * Much faster and more reliable than AI.
 */
const detectSyntax = (text: string): SyntaxType => {
  const t = text.trim();
  if (t.startsWith('<') && t.endsWith('>')) return SyntaxType.LORA;
  if (t.startsWith('{') && t.endsWith('}')) return SyntaxType.DYNAMIC;
  if ((t.startsWith('(') && t.endsWith(')')) || (t.startsWith('[') && t.endsWith(']'))) return SyntaxType.WEIGHTED;
  return SyntaxType.NORMAL;
};

// --- PROMPTS ---

/**
 * STANDARD PROMPT: AI does Translation + Classification
 */
const createStandardSystemInstruction = (categories: string[]) => `
Task: Translate and Classify ComfyUI prompt segments.

Input: JSON Array of strings.
Output: JSON Array of objects.

Rules:
1. Maintain exact order.
2. 'cat': Choose best fit from: [${categories.join(', ')}].
3. 'en': English prompt. (Translate if input is Chinese).
4. 'cn': Chinese meaning. (Translate if input is English).
5. If segment is LoRA (<...>) or Dynamic ({...}), keep 'en' as is, just provide meaning in 'cn'.

Output JSON Keys:
- en: English Text
- cn: Chinese Translation
- cat: Category
`;

/**
 * HYBRID PROMPT: AI only does Classification (Translation provided by Baidu)
 */
const createHybridSystemInstruction = (categories: string[]) => `
Task: Classify prompt segments based on provided text and translation.

Input: JSON Array of objects: { "en": "EnglishText", "cn_hint": "PreTranslatedText" }
Output: JSON Array of objects.

Rules:
1. 'cat': Choose best fit from: [${categories.join(', ')}].
2. 'en': Refine the English text if needed, usually keep as is.
3. 'cn': Use the 'cn_hint' as the translation unless it is completely wrong.
4. Maintain exact order.

Output JSON Keys:
- en: English Text
- cn: Chinese Translation
- cat: Category
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tags: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          en: { type: Type.STRING },
          cn: { type: Type.STRING },
          cat: { type: Type.STRING }
        },
        required: ["en", "cn", "cat"]
      }
    }
  }
};

/**
 * Helper to normalize AI response and merge with Original Segments
 */
const normalizeTags = (aiResult: any, originalSegments: string[]): any[] => {
  let resultList: any[] = [];

  // Handle various AI return structures
  if (aiResult.tags && Array.isArray(aiResult.tags)) {
    resultList = aiResult.tags;
  } else if (Array.isArray(aiResult)) {
    resultList = aiResult;
  } else if (typeof aiResult === 'object' && aiResult !== null) {
    resultList = [aiResult];
  }

  // Map back to original segments by index
  return originalSegments.map((segment, index) => {
    // If AI missed a segment (rare), provide fallback
    const item = resultList[index] || {};
    
    // Support both old keys (compatibility) and new minified keys
    const englishText = item.en || item.englishText || segment;
    const translation = item.cn || item.translation || segment;
    const category = item.cat || item.category || '其他';
    
    // Compute Syntax Locally
    const syntaxType = detectSyntax(segment);

    return {
      originalText: segment,
      englishText: englishText,
      translation: translation,
      category: category,
      syntaxType: syntaxType, // Computed locally
      raw: segment // From input
    };
  });
};

// --- PROVIDER CALLS ---

const callGemini = async (contents: string, systemInstruction: string) => {
    const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
    });
    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    return JSON.parse(jsonText);
}

const callCustomProvider = async (messages: any[], config: AIConfig) => {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
      })
    });

    if (!response.ok) {
      throw new Error(`Custom Provider Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) throw new Error("Empty response from Custom Provider");

    const jsonString = content.replace(/```json\n?|```/g, '').trim();
    return JSON.parse(jsonString);
}

// --- MAIN PARSER ---

export const parseSegmentsWithGemini = async (segments: string[], availableCategories: CategoryDef[], config?: AIConfig): Promise<PromptTag[]> => {
  if (segments.length === 0) return [];

  const categoryNames = availableCategories.map(c => c.name);
  const validSegments = segments.filter(s => s.trim().length > 0);
  if (validSegments.length === 0) return [];

  try {
    let aiRawData: any;
    let inputForAI: string = JSON.stringify(validSegments);
    let systemPrompt = createStandardSystemInstruction(categoryNames);

    // 1. Check if Baidu Translation is Enabled
    if (config?.baidu?.enabled && config.baidu.appId && config.baidu.secretKey) {
        try {
            // Attempt Baidu Translation
            const baiduTranslations = await translateWithBaidu(validSegments, config.baidu);
            
            // If successful, construct a hybrid input for AI
            // We pass { en: original, cn_hint: baidu_result }
            const hybridInput = validSegments.map((seg, i) => ({
                en: seg,
                cn_hint: baiduTranslations[i]
            }));
            
            inputForAI = JSON.stringify(hybridInput);
            systemPrompt = createHybridSystemInstruction(categoryNames);
            
        } catch (baiduError) {
            console.warn("Baidu Translation Failed, falling back to full AI:", baiduError);
            // Fallback to standard prompt (inputForAI and systemPrompt remain default)
        }
    }

    // 2. Call AI (Gemini or Custom)
    if (config && config.useCustom && config.apiKey) {
      aiRawData = await callCustomProvider([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: inputForAI }
      ], config);
    } else {
      aiRawData = await callGemini(inputForAI, systemPrompt);
    }

    // 3. Normalize Results
    const normalizedTags = normalizeTags(aiRawData, validSegments);

    return normalizedTags.map((tag: any, index: number) => ({
      ...tag,
      id: `temp-${Date.now()}-${index}`
    }));

  } catch (error) {
    console.error("AI Parsing Error:", error);
    throw error;
  }
};

export const parsePromptWithGemini = async (input: string, availableCategories: CategoryDef[], config?: AIConfig): Promise<{ tags: PromptTag[] }> => {
    const segments = input.split(/,|，/).map(s => s.trim()).filter(s => s);
    const tags = await parseSegmentsWithGemini(segments, availableCategories, config);
    return { tags };
};
