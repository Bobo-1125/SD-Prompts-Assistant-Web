
import React, { useState } from 'react';
import { X, Plus, RotateCcw, Download, Trash, Database } from 'lucide-react';
import { CategoryDef, COLOR_PALETTE, DEFAULT_CATEGORIES } from '../types';
import { dictionaryService } from '../services/dictionaryService';

interface CategorySettingsProps {
  categories: CategoryDef[];
  setCategories: (cats: CategoryDef[]) => void;
  onClose: () => void;
}

const CategorySettings: React.FC<CategorySettingsProps> = ({ categories, setCategories, onClose }) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-850">
          <h3 className="font-semibold text-white">设置 (Settings)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-6">
          
          {/* Section: Categories */}
          <div className="space-y-4">
              <h4 className="text-xs text-gray-400 uppercase tracking-wider font-bold">分类管理 (Categories)</h4>
              
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-gray-500">名称</label>
                  <input 
                    type="text" 
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                    placeholder="新增分类..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500">颜色</label>
                  <select 
                    value={newCatColor}
                    onChange={e => setNewCatColor(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm outline-none"
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

              <div className="space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
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
          </div>

          <hr className="border-gray-800" />

          {/* Section: Dictionary */}
          <div className="space-y-4">
            <h4 className="text-xs text-gray-400 uppercase tracking-wider font-bold flex items-center gap-2">
                <Database size={12} /> 
                词库维护 (Dictionary)
            </h4>
            <p className="text-[10px] text-gray-500">
                系统会自动记录 AI 翻译过的生僻词到本地。您可以导出 JSON 并手动添加到源代码中以丰富基础词库。
            </p>
            <div className="flex gap-2">
                <button 
                    onClick={handleExportDictionary}
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-300 py-2 rounded transition-colors"
                >
                    <Download size={14} />
                    {exportCopied ? '已复制 JSON!' : '复制完整词库 JSON'}
                </button>
                 <button 
                    onClick={handleClearLearned}
                    className="px-3 flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-xs text-red-400 py-2 rounded transition-colors"
                    title="清除本地学习数据"
                >
                    <Trash size={14} />
                </button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-850 border-t border-gray-800 flex justify-between">
           <button 
            onClick={handleReset}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RotateCcw size={14} /> 重置分类
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategorySettings;
