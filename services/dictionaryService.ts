
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
   */
  private saveToStorage() {
    try {
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
   * Fuzzy Search for Autocomplete
   */
  public search(query: string, limit: number = 20): Array<{ key: string } & DictionaryEntry> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results: Array<{ key: string; score: number } & DictionaryEntry> = [];

    Object.entries(this.dictionary).forEach(([key, entry]) => {
      let score = 0;
      const keyLower = key.toLowerCase();
      const transLower = entry.translation.toLowerCase();

      // Matching Logic & Scoring
      if (keyLower === q || transLower === q) {
        score = 100; // Exact match
      } else if (keyLower.startsWith(q)) {
        score = 80; // Starts with English
      } else if (transLower.startsWith(q)) {
        score = 70; // Starts with Chinese
      } else if (keyLower.includes(q)) {
        score = 50; // Contains English
      } else if (transLower.includes(q)) {
        score = 40; // Contains Chinese
      }

      if (score > 0) {
        results.push({ key, score, ...entry });
      }
    });

    // Sort by score (desc) then by length (asc) for shorter matches first
    return results
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.key.length - b.key.length;
      })
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }

  /**
   * Learn a new tag from AI results.
   */
  public learn(tag: PromptTag) {
    if (!tag || !tag.englishText) return;
    
    // Filter: Do not learn tags with category '其他'
    if (tag.category === '其他') return;
    
    const normalized = tag.englishText.toLowerCase().trim();
    
    if (SEED_DICTIONARY[normalized]) return;

    const existing = this.dictionary[normalized];
    if (existing && existing.category === tag.category && existing.translation === tag.translation) {
      return;
    }

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
        // Filter: Do not learn tags with category '其他'
        if (tag.category === '其他') return;

        const normalized = tag.englishText.toLowerCase().trim();
        if (SEED_DICTIONARY[normalized]) return;
        
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

  public exportJson(): string {
    return JSON.stringify(this.dictionary, null, 2);
  }

  public clearLearned() {
    localStorage.removeItem(STORAGE_KEY);
    this.dictionary = { ...SEED_DICTIONARY };
  }
}

export const dictionaryService = new DictionaryService();
