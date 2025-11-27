
import React, { useState } from 'react';
import { X, Plus, RotateCcw, Download, Trash, Database, Bot, LayoutGrid, Keyboard } from 'lucide-react';
import { CategoryDef, COLOR_PALETTE, DEFAULT_CATEGORIES, AIConfig, ShortcutConfig } from '../types';
import { dictionaryService } from '../services/dictionaryService';

interface CategorySettingsProps {
  categories: CategoryDef[];
  setCategories: (cats: CategoryDef[]) => void;
  onClose: () => void;
  aiConfig: AIConfig;
  setAiConfig: (config: AIConfig) => void;
  shortcuts: ShortcutConfig;
  setShortcuts: (cfg: ShortcutConfig) => void;
}

type TabType = 'categories' | 'dictionary' | 'ai' | 'shortcuts';

const CategorySettings: React.FC<CategorySettingsProps> = ({ categories, setCategories, onClose, aiConfig, setAiConfig, shortcuts, setShortcuts }) => {
  const [activeTab, setActiveTab] = useState<TabType>('categories');
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('blue');
  const [exportCopied, setExportCopied] = useState(false);

  const handleAdd = () => {
    if (!newCatName.trim()) return;
    const newCat: CategoryDef = {
      id: Date.now().toString(),
      name: newCatName.trim(),
      color: newCatColor
    };
    setCategories([...categories, newCat]);
    setNewCatName('');
  };

  const handleRemove = (id: string) => {
    setCategories(categories.filter(c => c.id !== id));
  };

  const handleReset = () => {
    if (confirm('确定要重置为默认分类吗？')) {
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const handleExportDictionary = () => {
    const json = dictionaryService.exportJson();
    navigator.clipboard.writeText(json);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const handleClearLearned = () => {
      if(confirm('确定要清除所有 AI 学习到的本地缓存吗？这不会影响源代码中的种子词库。')) {
          dictionaryService.clearLearned();
          alert('本地学习数据已清除。');
      }
  }

  const handleAIConfigChange = (key: keyof AIConfig, value: any) => {
    setAiConfig({ ...aiConfig, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-850">
          <h3 className="font-semibold text-white">设置 (Settings)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-gray-800 bg-gray-900/50 overflow-x-auto">
            <button 
                onClick={() => setActiveTab('categories')}
                className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'categories' ? 'border-indigo-500 text-indigo-400 bg-indigo-900/10' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
                <LayoutGrid size={14} /> 分类
            </button>
            <button 
                onClick={() => setActiveTab('dictionary')}
                className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'dictionary' ? 'border-indigo-500 text-indigo-400 bg-indigo-900/10' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
                <Database size={14} /> 词库
            </button>
            <button 
                onClick={() => setActiveTab('ai')}
                className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'ai' ? 'border-indigo-500 text-indigo-400 bg-indigo-900/10' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
                <Bot size={14} /> AI
            </button>
             <button 
                onClick={() => setActiveTab('shortcuts')}
                className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'shortcuts' ? 'border-indigo-500 text-indigo-400 bg-indigo-900/10' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
                <Keyboard size={14} /> 快捷键
            </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* TAB: Categories */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
                <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                    <label className="text-[10px] text-gray-500">名称</label>
                    <input 
                        type="text" 
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:border-indigo-500 outline-none text-gray-200"
                        placeholder="新增分类..."
                    />
                    </div>
                    <div className="space-y-1">
                    <label className="text-[10px] text-gray-500">颜色</label>
                    <select 
                        value={newCatColor}
                        onChange={e => setNewCatColor(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm outline-none text-gray-200"
                    >
                        {COLOR_PALETTE.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                    </div>
                    <button 
                    onClick={handleAdd}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded transition-colors"
                    >
                    <Plus size={20} />
                    </button>
                </div>

                <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                    {categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between bg-gray-800/50 p-2 rounded border border-gray-800 group hover:border-gray-700 transition-colors">
                        <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${COLOR_PALETTE.find(c => c.name === cat.color)?.value.split(' ')[0].replace('/40', '')}`}></div>
                        <span className="text-sm text-gray-200">{cat.name}</span>
                        </div>
                        <button onClick={() => handleRemove(cat.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={16} />
                        </button>
                    </div>
                    ))}
                </div>
                
                <div className="pt-4 border-t border-gray-800">
                    <button 
                        onClick={handleReset}
                        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        <RotateCcw size={14} /> 重置为默认分类
                    </button>
                </div>
            </div>
          )}

          {/* TAB: Dictionary */}
          {activeTab === 'dictionary' && (
            <div className="space-y-4">
                <p className="text-[10px] text-gray-500 bg-gray-800/50 p-3 rounded border border-gray-800">
                    系统会自动记录 AI 翻译过的生僻词到本地。您可以导出 JSON 并手动添加到源代码中以丰富基础词库。
                </p>
                <div className="flex gap-2">
                    <button 
                        onClick={handleExportDictionary}
                        className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-300 py-3 rounded transition-colors"
                    >
                        <Download size={14} />
                        {exportCopied ? '已复制 JSON!' : '复制完整词库 JSON'}
                    </button>
                    <button 
                        onClick={handleClearLearned}
                        className="px-4 flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-xs text-red-400 py-3 rounded transition-colors"
                        title="清除本地学习数据"
                    >
                        <Trash size={14} />
                    </button>
                </div>
            </div>
          )}

          {/* TAB: AI Config */}
          {activeTab === 'ai' && (
             <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-200">启用自定义 AI 提供商</span>
                    <button 
                        onClick={() => handleAIConfigChange('useCustom', !aiConfig.useCustom)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${aiConfig.useCustom ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${aiConfig.useCustom ? 'translate-x-5' : ''}`}></div>
                    </button>
                </div>

                {aiConfig.useCustom && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded text-[11px] text-amber-200/80">
                           请输入 OpenAI 兼容的 API 配置 (例如 SiliconFlow, DeepSeek 等)。
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 uppercase font-bold">Base URL</label>
                            <input 
                                type="text" 
                                value={aiConfig.baseUrl}
                                onChange={e => handleAIConfigChange('baseUrl', e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 outline-none font-mono"
                                placeholder="https://api.siliconflow.cn/v1"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 uppercase font-bold">API Key (App Key)</label>
                            <input 
                                type="password" 
                                value={aiConfig.apiKey}
                                onChange={e => handleAIConfigChange('apiKey', e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 outline-none font-mono"
                                placeholder="sk-..."
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 uppercase font-bold">Model Name</label>
                            <input 
                                type="text" 
                                value={aiConfig.model}
                                onChange={e => handleAIConfigChange('model', e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 outline-none font-mono"
                                placeholder="deepseek-ai/DeepSeek-V2.5"
                            />
                        </div>
                    </div>
                )}
                
                {!aiConfig.useCustom && (
                    <div className="text-xs text-gray-500 text-center py-8 italic">
                        正在使用系统默认 AI 模型 (Gemini 2.5 Flash)
                    </div>
                )}
             </div>
          )}

          {/* TAB: Shortcuts */}
          {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                   <div className="p-3 bg-indigo-900/20 border border-indigo-800/50 rounded text-[11px] text-indigo-200/80 leading-relaxed">
                        快捷键有助于快速编辑和检查提示词。设置的快捷键会自动保存。
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                             <label className="text-[10px] text-gray-500 uppercase font-bold block">主要修饰键 (Modifier)</label>
                             <div className="flex flex-col gap-2">
                                {['Control', 'Meta', 'Alt'].map(key => (
                                    <label key={key} className="flex items-center gap-2 cursor-pointer bg-gray-800 p-2 rounded border border-gray-700 hover:bg-gray-700">
                                        <input 
                                            type="radio" 
                                            name="interactionKey"
                                            checked={shortcuts.interactionKey === key}
                                            onChange={() => setShortcuts({...shortcuts, interactionKey: key as any})}
                                            className="accent-indigo-500"
                                        />
                                        <span className="text-sm font-mono">{key}</span>
                                    </label>
                                ))}
                             </div>
                             <p className="text-[10px] text-gray-600 mt-1">注: Mac 用户推荐使用 Meta (Command)。</p>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-[10px] text-gray-500 uppercase font-bold block">禁用/启用切换键</label>
                             <input 
                                type="text" 
                                value={shortcuts.toggleDisableKey}
                                maxLength={1}
                                onChange={e => setShortcuts({...shortcuts, toggleDisableKey: e.target.value})}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-center text-lg font-mono text-white focus:border-indigo-500 outline-none"
                            />
                            <div className="text-center text-xs text-gray-400 mt-2">
                                当前组合: <span className="font-bold text-white bg-gray-800 px-1 rounded">{shortcuts.interactionKey}</span> + <span className="font-bold text-white bg-gray-800 px-1 rounded">{shortcuts.toggleDisableKey}</span>
                            </div>
                        </div>
                   </div>
                   
                   <div className="border-t border-gray-800 pt-4">
                       <h4 className="text-xs font-bold text-gray-400 mb-2">交互说明</h4>
                       <ul className="text-[11px] text-gray-500 space-y-1 list-disc list-inside">
                           <li>按住 <strong className="text-gray-300">{shortcuts.interactionKey}</strong> 键进入交互模式。</li>
                           <li>在交互模式下，鼠标悬浮在输入框的单词上可查看翻译详情。</li>
                           <li>使用 <strong className="text-gray-300">{shortcuts.interactionKey} + {shortcuts.toggleDisableKey}</strong> 快速禁用/启用光标处的提示词。</li>
                       </ul>
                   </div>
              </div>
          )}

        </div>

        <div className="p-4 bg-gray-850 border-t border-gray-800 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded transition-colors border border-gray-700"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategorySettings;
