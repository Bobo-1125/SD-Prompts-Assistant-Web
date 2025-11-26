import { GoogleGenAI, Type } from "@google/genai";
import { SyntaxType, ParseResult, CategoryDef, PromptTag } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const modelName = "gemini-2.5-flash";

const createSystemInstruction = (categories: string[]) => `
You are an expert AI for Stable Diffusion and ComfyUI prompt engineering. 
Your task is to analyze a list of prompt segments.

Rules:
1. I will provide a JSON array of strings (segments).
2. For EACH segment, analyze it independently but maintain the original order.
3. Classify:
   - Identify the 'category' strictly from this list: [${categories.join(', ')}].
   - If a segment fits 'LoRA' syntax (<...>), it MUST be categorized as 'LoRA'.
   - Identify 'syntaxType' (Normal, Weighted, Dynamic, LoRA).
4. Translate:
   - 'englishText': The core English concept. If input is Chinese, TRANSLATE it to English.
   - 'translation': The Chinese meaning. If input is English, TRANSLATE it to Chinese.
5. 'raw': Return the exact input string for that segment.
`;

/**
 * Parses a list of raw string segments.
 * This allows us to only send "new" or "modified" segments to the AI, rather than the whole prompt.
 */
export const parseSegmentsWithGemini = async (segments: string[], availableCategories: CategoryDef[]): Promise<PromptTag[]> => {
  if (segments.length === 0) return [];

  const categoryNames = availableCategories.map(c => c.name);
  // Filter out empty segments
  const validSegments = segments.filter(s => s.trim().length > 0);
  if (validSegments.length === 0) return [];

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: JSON.stringify(validSegments),
      config: {
        systemInstruction: createSystemInstruction(categoryNames),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  originalText: { type: Type.STRING },
                  englishText: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  category: { 
                    type: Type.STRING,
                    enum: categoryNames
                  },
                  syntaxType: {
                    type: Type.STRING,
                    enum: Object.values(SyntaxType)
                  },
                  raw: { type: Type.STRING }
                },
                required: ["originalText", "englishText", "translation", "category", "syntaxType", "raw"]
              }
            }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");

    const parsed = JSON.parse(jsonText);
    
    // The API might return tags. We assign temporary IDs here, 
    // but the App.tsx logic is responsible for managing stable IDs during the merge.
    const tagsWithIds = parsed.tags.map((tag: any, index: number) => ({
      ...tag,
      id: `temp-${Date.now()}-${index}`
    }));

    return tagsWithIds;
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    throw error;
  }
};

// Keep the original function signature for backward compatibility if needed, 
// but internally use the new logic logic by splitting.
export const parsePromptWithGemini = async (input: string, availableCategories: CategoryDef[]): Promise<ParseResult> => {
    // Simple comma split for backward compat
    const segments = input.split(/,|，/).map(s => s.trim()).filter(s => s);
    const tags = await parseSegmentsWithGemini(segments, availableCategories);
    return { tags };
};