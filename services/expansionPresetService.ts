
import { ExpansionPreset } from '../types';

const STORAGE_KEY = 'comfyui_expansion_presets_v1';

const DEFAULT_PRESETS: ExpansionPreset[] = [
  {
    id: 'sdxl-danbooru',
    name: 'Standard Tags (SDXL/Pony)',
    description: '生成逗号分隔的 Danbooru 风格标签。适用于 SD1.5, SDXL, Pony 等模型。',
    isDefault: true,
    systemPrompt: `Task: You are an expert Stable Diffusion Prompt Assistant. 
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
5. Consider the 'full_context' to ensure consistency.
6. High quality, detailed tags are preferred.`
  },
  {
    id: 'flux-natural',
    name: 'Natural Language (Flux/Qwen)',
    description: '生成流畅、详细的自然语言描述句。适用于 FLUX.1, DALL-E 3, Qwen-VL 等模型。',
    isDefault: true,
    systemPrompt: `Task: You are an expert Image Generation Prompt Engineer specializing in Natural Language Processing models like FLUX.1.
Your goal is to generate, expand, or rewrite descriptions based on user instructions and context.

Input JSON:
{
  "full_context": "The entire current prompt string",
  "selected_text": "The specific part to modify (can be empty if inserting)",
  "instruction": "User's request"
}

Output: 
Return ONLY the generated English description. 
Do not output Markdown, JSON, or explanations.

Rules:
1. Output MUST be in English.
2. Use natural, descriptive sentences. Avoid comma-separated tag lists unless grammatically appropriate.
3. Focus on lighting, composition, texture, and atmosphere.
4. If 'selected_text' is provided, your output will REPLACE it.
5. If 'selected_text' is empty, your output will be INSERTED at the cursor.
6. Ensure the tone is objective yet descriptive.`
  }
];

class ExpansionPresetService {
  private presets: ExpansionPreset[];

  constructor() {
    this.presets = this.load();
    // Ensure defaults exist if storage is empty or corrupted
    if (this.presets.length === 0) {
      this.presets = [...DEFAULT_PRESETS];
      this.save();
    }
  }

  private load(): ExpansionPreset[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge defaults if they are missing (in case of updates)
        const merged = [...parsed];
        DEFAULT_PRESETS.forEach(def => {
            if (!merged.find(p => p.id === def.id)) {
                merged.unshift(def);
            }
        });
        return merged;
      }
      return [...DEFAULT_PRESETS];
    } catch (e) {
      console.warn('Failed to load expansion presets', e);
      return [...DEFAULT_PRESETS];
    }
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.presets));
  }

  public getAll(): ExpansionPreset[] {
    return [...this.presets];
  }

  public getById(id: string): ExpansionPreset | undefined {
    return this.presets.find(p => p.id === id);
  }

  public add(preset: Omit<ExpansionPreset, 'id' | 'isDefault'>): ExpansionPreset {
    const newPreset: ExpansionPreset = {
      ...preset,
      id: `custom-${Date.now()}`,
      isDefault: false
    };
    this.presets.push(newPreset);
    this.save();
    return newPreset;
  }

  public update(id: string, updates: Partial<Omit<ExpansionPreset, 'id' | 'isDefault'>>): ExpansionPreset | null {
    const index = this.presets.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.presets[index] = { ...this.presets[index], ...updates };
    this.save();
    return this.presets[index];
  }

  public delete(id: string): boolean {
    const index = this.presets.findIndex(p => p.id === id);
    if (index === -1) return false;
    
    // Prevent deleting defaults? Or allow but allow reset? 
    // Let's protect defaults from deletion for now, but allow editing.
    if (this.presets[index].isDefault) {
        console.warn("Cannot delete default preset");
        return false;
    }

    this.presets.splice(index, 1);
    this.save();
    return true;
  }

  public resetDefaults() {
    this.presets = [...DEFAULT_PRESETS];
    this.save();
    return this.presets;
  }
}

export const expansionPresetService = new ExpansionPresetService();
