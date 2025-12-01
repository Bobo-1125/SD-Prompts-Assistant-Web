
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

// Helper: Detect Chinese characters
const isChinese = (text: string) => /[\u4e00-\u9fa5]/.test(text);

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
 * Updated to handle Mixed Input (En->Zh and Zh->En)
 */
const createHybridSystemInstruction = (categories: string[]) => `
Task: Classify and Standardize ComfyUI prompt segments.

Input: JSON Array of objects: { "raw": "OriginalText", "trans_hint": "BaiduTranslation" }
Output: JSON Array of objects.

Rules:
1. 'cat': Select best fit from: [${categories.join(', ')}].
2. 'en' (English Prompt):
   - If 'raw' contains Chinese, use 'trans_hint' (or improve it to be better English).
   - If 'raw' is English, keep 'raw' exactly as is.
3. 'cn' (Chinese Meaning):
   - If 'raw' contains Chinese, use 'raw' as the meaning.
   - If 'raw' is English, use 'trans_hint'.
4. Maintain exact order.

Output JSON Keys:
- en: English Text
- cn: Chinese Translation (Must be Chinese)
- cat: Category
`;

/**
 * EXPANSION PROMPT: AI acts as a creative assistant
 */
const createExpansionSystemInstruction = () => `
Task: You are an expert Stable Diffusion Prompt Assistant. 
Your goal is to generate, expand, or rewrite prompt tags based on user instructions and context.

Input JSON:
{
  "full_context": "The entire current prompt string",
  "selected_text": "The specific part to modify (can be empty if inserting)",
  "instruction": "User's request (e.g., 'make it cyberpunk', 'add lighting')"
}

Output: 
Return ONLY the generated English prompt tags as a comma-separated string.
Do not output Markdown, JSON, or explanations. Just the tags.

Rules:
1. Output MUST be in English.
2. Use standard Danbooru-style tags (e.g., "1girl, cyberpunk, neon lights").
3. If 'selected_text' is provided, your output will REPLACE it.
4. If 'selected_text' is empty, your output will be INSERTED at the cursor.
5. Consider the 'full_context' to ensure consistency (e.g., don't add '1girl' if there is already '1boy' unless instructed).
6. High quality, detailed tags are preferred.
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

const callGemini = async (contents: string, systemInstruction: string, isJsonMode: boolean = true) => {
    const config: any = {
        systemInstruction: systemInstruction,
    };
    
    if (isJsonMode) {
        config.responseMimeType = "application/json";
        config.responseSchema = RESPONSE_SCHEMA;
    }

    const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: config
    });
    return response.text;
}

const callCustomProvider = async (messages: any[], config: AIConfig, isJsonMode: boolean = true) => {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        stream: false,
        enable_thinking: false, 
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Custom Provider Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) throw new Error("Empty response from Custom Provider");

    if (isJsonMode) {
        const jsonString = content.replace(/```json\n?|```/g, '').trim();
        return JSON.parse(jsonString);
    }
    
    return content;
}

// --- EXPANSION SERVICE ---

export const expandPromptWithGemini = async (
    fullContext: string,
    selectedText: string,
    instruction: string,
    config?: AIConfig
): Promise<string> => {
    const systemPrompt = createExpansionSystemInstruction();
    
    const inputPayload = {
        full_context: fullContext,
        selected_text: selectedText,
        instruction: instruction
    };
    
    const inputString = JSON.stringify(inputPayload);

    try {
        let resultText = "";

        if (config && config.useCustom && config.apiKey) {
            resultText = await callCustomProvider([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: inputString }
            ], config, false); // False = Expect Text, not JSON structure
        } else {
            resultText = await callGemini(inputString, systemPrompt, false) || "";
        }

        // Cleanup response (remove quotes or markdown if any)
        return resultText.replace(/^"|"$/g, '').trim();

    } catch (error) {
        console.error("AI Expansion Error:", error);
        throw error;
    }
};

// --- MAIN PARSER ---

export const parseSegmentsWithGemini = async (
    segments: string[], 
    availableCategories: CategoryDef[], 
    config?: AIConfig,
    onProgress?: (translations: string[]) => void
): Promise<PromptTag[]> => {
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
        console.groupCollapsed("Baidu Translation Check");
        try {
            // Split segments based on language to optimize target language
            const zhIndices: number[] = [];
            const enIndices: number[] = [];
            
            validSegments.forEach((seg, idx) => {
                if (isChinese(seg)) zhIndices.push(idx);
                else enIndices.push(idx);
            });

            const baiduResults = new Array(validSegments.length).fill('');
            const tasks = [];

            // Task 1: Translate Chinese inputs to English (Zh -> En)
            if (zhIndices.length > 0) {
                const textsToTranslate = zhIndices.map(i => validSegments[i]);
                tasks.push(
                    translateWithBaidu(textsToTranslate, config.baidu, 'en')
                        .then(res => {
                            res.forEach((r, i) => baiduResults[zhIndices[i]] = r);
                        })
                );
            }

            // Task 2: Translate English inputs to Chinese (En -> Zh)
            if (enIndices.length > 0) {
                const textsToTranslate = enIndices.map(i => validSegments[i]);
                tasks.push(
                    translateWithBaidu(textsToTranslate, config.baidu, 'zh')
                        .then(res => {
                             res.forEach((r, i) => baiduResults[enIndices[i]] = r);
                        })
                );
            }

            await Promise.all(tasks);
            console.log("Baidu Results (Merged):", baiduResults);
            
            // Immediate Callback: Show Baidu results on UI
            if (onProgress) {
                onProgress(baiduResults);
            }
            
            // Construct Hybrid Input
            const hybridInput = validSegments.map((seg, i) => ({
                raw: seg,
                trans_hint: baiduResults[i] || seg 
            }));
            
            console.log("Hybrid Input for AI:", hybridInput);

            inputForAI = JSON.stringify(hybridInput);
            systemPrompt = createHybridSystemInstruction(categoryNames);
            
        } catch (baiduError) {
            console.warn("Baidu Translation Failed, falling back to full AI. Reason:", baiduError);
            // Fallback to standard prompt
        }
        console.groupEnd();
    }

    // 2. Call AI (Gemini or Custom)
    if (config && config.useCustom && config.apiKey) {
      aiRawData = await callCustomProvider([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: inputForAI }
      ], config, true);
    } else {
      const responseText = await callGemini(inputForAI, systemPrompt, true);
      if (responseText) aiRawData = JSON.parse(responseText);
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
