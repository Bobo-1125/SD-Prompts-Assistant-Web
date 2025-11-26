
import { DictionaryEntry, DictionaryMap, PromptTag, SyntaxType } from '../types';
import { SEED_DICTIONARY } from '../data/promptDictionary';

const STORAGE_KEY = 'comfyui_prompt_dict_v1';

class DictionaryService {
  private dictionary: DictionaryMap;

  constructor() {
    this.dictionary = { ...SEED_DICTIONARY };
    this.loadFromStorage();
  }

  /**
   * Loads learned tags from LocalStorage and merges them into the memory dictionary.
   */
  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.dictionary = { ...this.dictionary, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load dictionary from storage', e);
    }
  }

  /**
   * Saves the current learned additions to LocalStorage.
   * We only save what is NOT in the seed dictionary to save space, 
   * or we can just save the delta. For simplicity, we'll save the whole learned set.
   */
  private saveToStorage() {
    try {
      // We only want to save entries that differ from SEED or are new
      // But for performance/simplicity in this demo, let's just dump the "learned" parts.
      // A better approach: distinct keys.
      const learnedKeys = Object.keys(this.dictionary).filter(k => !SEED_DICTIONARY[k]);
      const learnedMap: DictionaryMap = {};
      learnedKeys.forEach(k => learnedMap[k] = this.dictionary[k]);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(learnedMap));
    } catch (e) {
      console.warn('Failed to save dictionary to storage', e);
    }
  }

  /**
   * Lookup a prompt text in the dictionary.
   * Case insensitive.
   */
  public lookup(text: string): DictionaryEntry | null {
    const normalized = text.toLowerCase().trim();
    return this.dictionary[normalized] || null;
  }

  /**
   * Learn a new tag from AI results.
   */
  public learn(tag: PromptTag) {
    if (!tag || !tag.englishText) return;
    
    const normalized = tag.englishText.toLowerCase().trim();
    
    // Don't overwrite if it exists in SEED (Seed is trusted source),
    // unless we want to allow AI to improve it. Let's trust SEED more.
    if (SEED_DICTIONARY[normalized]) return;

    // Check if we already know it and it matches
    const existing = this.dictionary[normalized];
    if (existing && existing.category === tag.category && existing.translation === tag.translation) {
      return;
    }

    // Add to dictionary
    this.dictionary[normalized] = {
      translation: tag.translation,
      category: tag.category,
      syntaxType: tag.syntaxType === SyntaxType.NORMAL ? undefined : tag.syntaxType
    };

    this.saveToStorage();
  }

  /**
   * Learn multiple tags at once
   */
  public learnBatch(tags: PromptTag[]) {
    let changed = false;
    tags.forEach(tag => {
        const normalized = tag.englishText.toLowerCase().trim();
        if (SEED_DICTIONARY[normalized]) return;
        
        // Skip learning LoRA or dynamic prompts usually as they are too specific,
        // but user might want them. Let's store them.
        
        const existing = this.dictionary[normalized];
        if (!existing) {
            this.dictionary[normalized] = {
                translation: tag.translation,
                category: tag.category,
                syntaxType: tag.syntaxType
            };
            changed = true;
        }
    });

    if (changed) {
        this.saveToStorage();
    }
  }

  /**
   * Export the full dictionary (Seed + Learned) as JSON string
   */
  public exportJson(): string {
    return JSON.stringify(this.dictionary, null, 2);
  }

  /**
   * Clear learned data
   */
  public clearLearned() {
    localStorage.removeItem(STORAGE_KEY);
    this.dictionary = { ...SEED_DICTIONARY };
  }
}

export const dictionaryService = new DictionaryService();
