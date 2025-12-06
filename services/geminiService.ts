
import { GoogleGenAI, Type } from "@google/genai";
import { SyntaxType, CategoryDef, PromptTag, AIConfig } from "../types";
import { translateWithBaidu } from "./baiduService";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const modelName = "gemini-2.5-flash";

// Safe batch size to prevent AI from losing count. 
// 10-15 is usually the sweet spot for strict list mapping.
const CLASSIFICATION_BATCH_SIZE = 12;

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

// Helper: Chunk array
const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

// --- PROMPTS ---

/**
 * CLASSIFICATION ONLY PROMPT
 */
const createClassificationSystemInstruction = (categories: string[], count: number) => `
Task: Classify ComfyUI prompt tags into categories.

Categories: [${categories.join(', ')}]

Input: JSON Array of ${count} English prompt strings.
Output: JSON Array of EXACTLY ${count} strings (Category Names).

Rules:
1. Return ONLY the category name for each input string.
2. Maintain EXACT order. Input[0] -> Output[0].
3. If unsure, use "其他" (or 'Other').
4. Do NOT output objects, just an array of strings.
5. Do NOT skip any items.
`;

// --- PROVIDER CALLS ---

const callGemini = async (contents: string, systemInstruction: string, isJsonMode: boolean = true) => {
    const config: any = {
        systemInstruction: systemInstruction,
    };
    
    if (isJsonMode) {
        config.responseMimeType = "application/json";
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
        temperature: 0.1 // Lower temperature for classification stability
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

// --- NEW SERVICES ---

/**
 * 1. Translate Only (Uses Baidu, NO AI)
 */
export const translateSegments = async (
    segments: string[],
    config: AIConfig
): Promise<any[]> => {
    if (segments.length === 0) return [];
    
    const results = segments.map(seg => ({
        originalText: seg,
        englishText: seg, // Default to self
        translation: seg, // Default to self
        category: '其他',
        syntaxType: detectSyntax(seg),
        raw: seg
    }));

    // If Baidu is disabled or missing keys, return raw results immediately
    if (!config?.baidu?.enabled || !config.baidu.appId || !config.baidu.secretKey) {
        return results;
    }

    try {
        const zhIndices: number[] = [];
        const enIndices: number[] = [];
        
        segments.forEach((seg, idx) => {
            if (isChinese(seg)) zhIndices.push(idx);
            else enIndices.push(idx);
        });

        const tasks = [];
        const translatedValues = new Array(segments.length).fill(null);

        // Zh -> En
        if (zhIndices.length > 0) {
            const texts = zhIndices.map(i => segments[i]);
            tasks.push(
                translateWithBaidu(texts, config.baidu, 'en')
                .then(res => res.forEach((r, i) => translatedValues[zhIndices[i]] = { text: r, from: 'zh' }))
            );
        }

        // En -> Zh
        if (enIndices.length > 0) {
            const texts = enIndices.map(i => segments[i]);
            tasks.push(
                translateWithBaidu(texts, config.baidu, 'zh')
                .then(res => res.forEach((r, i) => translatedValues[enIndices[i]] = { text: r, from: 'en' }))
            );
        }

        await Promise.all(tasks);

        // Merge results
        translatedValues.forEach((item, i) => {
            if (item) {
                if (item.from === 'zh') {
                    // Was Chinese input, Translated to English
                    results[i].englishText = item.text; // The translation is the prompt
                    results[i].translation = segments[i]; // The original is the meaning
                } else {
                    // Was English input, Translated to Chinese
                    results[i].englishText = segments[i]; // The original is the prompt
                    results[i].translation = item.text; // The translation is the meaning
                }
            }
        });

    } catch (e) {
        console.error("Baidu Translation Error:", e);
        // Fallback: results are already populated with raw text
    }

    return results;
};

/**
 * 2. Classify Only (Uses AI) - BATCHED
 */
export const classifySegments = async (
    tags: { englishText: string }[],
    availableCategories: CategoryDef[],
    config?: AIConfig
): Promise<string[]> => {
    if (tags.length === 0) return [];

    const categoryNames = availableCategories.map(c => c.name);
    
    // Chunk input to avoid AI losing count
    const chunks = chunkArray(tags, CLASSIFICATION_BATCH_SIZE);
    
    // Process chunks in parallel (or sequential if rate limits are tight)
    const chunkPromises = chunks.map(async (chunk) => {
        const inputs = chunk.map(t => t.englishText);
        const inputString = JSON.stringify(inputs);
        const systemPrompt = createClassificationSystemInstruction(categoryNames, inputs.length);

        try {
            let aiResult: string[] = [];

            if (config && config.useCustom && config.apiKey) {
                 aiResult = await callCustomProvider([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: inputString }
                ], config, true);
            } else {
                const responseText = await callGemini(inputString, systemPrompt, true);
                if (responseText) aiResult = JSON.parse(responseText);
            }

            // Validation: Ensure array length matches input length
            if (!Array.isArray(aiResult)) {
                console.warn("AI returned non-array for classification");
                return new Array(inputs.length).fill('其他');
            }

            // If length mismatch, pad with '其他' to maintain alignment for future chunks
            if (aiResult.length !== inputs.length) {
                console.warn(`AI classification mismatch. Expected ${inputs.length}, got ${aiResult.length}. Padding results.`);
                const padded = [...aiResult];
                while (padded.length < inputs.length) padded.push('其他');
                return padded.slice(0, inputs.length); // Trim if too long (unlikely)
            }

            // Normalize results against valid categories
            return aiResult.map(cat => categoryNames.includes(cat) ? cat : '其他');

        } catch (error) {
            console.error("AI Classification Chunk Error:", error);
            return new Array(inputs.length).fill('其他');
        }
    });

    const resultsArray = await Promise.all(chunkPromises);
    
    // Flatten results
    return resultsArray.flat();
};

// --- EXPANSION SERVICE ---

export const expandPromptWithGemini = async (
    fullContext: string,
    selectedText: string,
    instruction: string,
    systemInstruction: string, // Changed: Now passed dynamically
    config?: AIConfig
): Promise<string> => {
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
                { role: 'system', content: systemInstruction },
                { role: 'user', content: inputString }
            ], config, false); 
        } else {
            resultText = await callGemini(inputString, systemInstruction, false) || "";
        }

        return resultText.replace(/^"|"$/g, '').trim();

    } catch (error) {
        console.error("AI Expansion Error:", error);
        throw error;
    }
};
