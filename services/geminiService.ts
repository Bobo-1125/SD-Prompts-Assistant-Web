
import { GoogleGenAI, Type } from "@google/genai";
import { SyntaxType, CategoryDef, PromptTag, AIConfig } from "../types";

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

/**
 * 1. Optimized System Instruction
 * Removed request for syntaxType and raw text echo.
 * Shortened field names to reduce token count.
 */
const createSystemInstruction = (categories: string[]) => `
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
 * 2. Optimized Custom Prompt
 */
const getCustomSystemPrompt = (categories: string[]) => `
Analyze prompt segments.
Categories: [${categories.join(', ')}]

Return JSON object with "tags" array.
For each segment, return:
{ "en": "English", "cn": "Chinese", "cat": "Category" }

Rules:
1. 'en': Input translated to English.
2. 'cn': Input translated to Chinese.
3. 'cat': One of the provided categories.
4. Do NOT analyze syntax (brackets, lora). Just translate meaning.
`;

// 3. Optimized Schema (Minified keys)
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
 * Reconstructs the full PromptTag object locally.
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

const parseWithDefaultGemini = async (segments: string[], categoryNames: string[]): Promise<any> => {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: JSON.stringify(segments),
    config: {
      systemInstruction: createSystemInstruction(categoryNames),
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  });

  const jsonText = response.text;
  if (!jsonText) throw new Error("No response from AI");
  const parsed = JSON.parse(jsonText);
  return parsed;
};

const parseWithCustomProvider = async (segments: string[], categoryNames: string[], config: AIConfig): Promise<any> => {
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: getCustomSystemPrompt(categoryNames) },
          { role: 'user', content: JSON.stringify(segments) }
        ],
      })
    });

    if (!response.ok) {
      throw new Error(`Custom Provider Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) throw new Error("Empty response from Custom Provider");

    const jsonString = content.replace(/```json\n?|```/g, '').trim();
    
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        console.error("JSON Parse Error", jsonString);
        throw new Error("Invalid JSON received from AI");
    }

    return parsed;

  } catch (error) {
    console.error("Custom Provider Failed:", error);
    throw error;
  }
};

export const parseSegmentsWithGemini = async (segments: string[], availableCategories: CategoryDef[], config?: AIConfig): Promise<PromptTag[]> => {
  if (segments.length === 0) return [];

  const categoryNames = availableCategories.map(c => c.name);
  const validSegments = segments.filter(s => s.trim().length > 0);
  if (validSegments.length === 0) return [];

  try {
    let aiRawData: any;

    if (config && config.useCustom && config.apiKey) {
      aiRawData = await parseWithCustomProvider(validSegments, categoryNames, config);
    } else {
      aiRawData = await parseWithDefaultGemini(validSegments, categoryNames);
    }

    // Merge AI data with Local Data (Syntax, Raw)
    const normalizedTags = normalizeTags(aiRawData, validSegments);

    // Assign temporary IDs
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
