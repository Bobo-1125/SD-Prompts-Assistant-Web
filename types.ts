
export interface CategoryDef {
  id: string;
  name: string; // The display name (e.g., "角色特征")
  color: string; // Tailwind color name (e.g., "blue")
  description?: string;
}

export enum SyntaxType {
  NORMAL = 'Normal',
  WEIGHTED = 'Weighted', // (), []
  DYNAMIC = 'Dynamic',   // {}
  LORA = 'LoRA',         // <...>
}

export interface PromptTag {
  id: string;
  originalText: string;
  englishText: string; // Used for copy
  translation: string; // Used for display
  category: string;    // Matches CategoryDef.name
  syntaxType: SyntaxType;
  raw: string;         // The full token
  isRefreshing?: boolean; // UI state for individual reloading
  disabled?: boolean; // UI state for temporary disable
}

export interface ParseResult {
  tags: PromptTag[];
}

export interface DictionaryEntry {
  translation: string;
  category: string; // ID or Name
  syntaxType?: SyntaxType;
}

export type DictionaryMap = Record<string, DictionaryEntry>;

export const COLOR_PALETTE = [
  { name: 'blue', value: 'bg-blue-900/40 border-blue-700/50 text-blue-200' },
  { name: 'purple', value: 'bg-purple-900/40 border-purple-700/50 text-purple-200' },
  { name: 'emerald', value: 'bg-emerald-900/40 border-emerald-700/50 text-emerald-200' },
  { name: 'amber', value: 'bg-amber-900/40 border-amber-700/50 text-amber-200' },
  { name: 'cyan', value: 'bg-cyan-900/40 border-cyan-700/50 text-cyan-200' },
  { name: 'rose', value: 'bg-rose-900/40 border-rose-700/50 text-rose-200' },
  { name: 'pink', value: 'bg-pink-900/40 border-pink-700/50 text-pink-200' },
  { name: 'indigo', value: 'bg-indigo-900/40 border-indigo-700/50 text-indigo-200' },
  { name: 'teal', value: 'bg-teal-900/40 border-teal-700/50 text-teal-200' },
  { name: 'orange', value: 'bg-orange-900/40 border-orange-700/50 text-orange-200' },
  { name: 'slate', value: 'bg-slate-800 border-slate-700 text-slate-300' },
];

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: '1', name: '角色特征', color: 'blue' },
  { id: '2', name: '衣服特征', color: 'pink' },
  { id: '3', name: '场景', color: 'emerald' },
  { id: '4', name: '拍摄角度', color: 'cyan' },
  { id: '5', name: '光线效果', color: 'amber' },
  { id: '6', name: '风格', color: 'purple' },
  { id: '7', name: '画面质量', color: 'indigo' },
  { id: '8', name: 'LoRA', color: 'rose' },
  { id: '9', name: '其他', color: 'slate' },
];
