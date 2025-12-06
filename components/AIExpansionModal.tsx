
import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Wand2, MessageSquare, Settings2, Plus, Trash2, Save, Undo2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ExpansionPreset } from '../types';
import { expansionPresetService } from '../services/expansionPresetService';

interface AIExpansionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  fullContext: string; 
  onConfirm: (instruction: string, systemPrompt: string) => void;
  isLoading: boolean;
}

const AIExpansionModal: React.FC<AIExpansionModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedText, 
  onConfirm, 
  isLoading 
}) => {
  const [instruction, setInstruction] = useState('');
  
  // Preset Management State
  const [presets, setPresets] = useState<ExpansionPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [isManageMode, setIsManageMode] = useState(false);
  
  // Editing State
  const [editingPreset, setEditingPreset] = useState<ExpansionPreset | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load presets on open
  useEffect(() => {
    if (isOpen) {
      setInstruction('');
      const allPresets = expansionPresetService.getAll();
      setPresets(allPresets);
      
      // Default to the first one (usually Standard) or persist last selection if we wanted
      if (allPresets.length > 0) {
          setSelectedPresetId(allPresets[0].id);
      }
      
      setIsManageMode(false);

      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (isLoading) return;
    const currentPreset = presets.find(p => p.id === selectedPresetId);
    if (!currentPreset) return;

    onConfirm(instruction, currentPreset.systemPrompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // --- Preset Logic ---

  const handleSavePreset = () => {
      if (!editingPreset) return;
      
      if (editingPreset.id.startsWith('temp-new')) {
          // Create new
          const { id, isDefault, ...data } = editingPreset;
          const created = expansionPresetService.add(data);
          setPresets(expansionPresetService.getAll());
          setEditingPreset(created); // Update to saved version
      } else {
          // Update existing
          expansionPresetService.update(editingPreset.id, {
              name: editingPreset.name,
              systemPrompt: editingPreset.systemPrompt
          });
          setPresets(expansionPresetService.getAll());
      }
  };

  const handleDeletePreset = (id: string) => {
      if(confirm('确定要删除此预设吗？')) {
          expansionPresetService.delete(id);
          const remaining = expansionPresetService.getAll();
          setPresets(remaining);
          // If we deleted the current editing one, select another
          if (remaining.length > 0) setEditingPreset(remaining[0]);
          else setEditingPreset(null);
      }
  };

  const handleAddNewPreset = () => {
      setEditingPreset({
          id: 'temp-new-' + Date.now(),
          name: '新预设 (New Preset)',
          systemPrompt: 'Your system prompt here...',
          isDefault: false
      });
  };
  
  const handleResetDefaults = () => {
      if(confirm('确定重置所有预设为默认状态吗？自定义预设将丢失。')) {
          const defaults = expansionPresetService.resetDefaults();
          setPresets(defaults);
          setEditingPreset(defaults[0]);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-indigo-500/30 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 ring-1 ring-indigo-500/20 max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-850 bg-gradient-to-r from-gray-900 to-indigo-900/20">
          <div className="flex items-center gap-3">
             <h3 className="font-semibold text-white flex items-center gap-2">
                <Sparkles size={18} className="text-indigo-400 fill-indigo-400/20"/> 
                {isManageMode ? '管理预设 (Manage Presets)' : 'AI 智能扩写 / 重写'}
             </h3>
             {!isManageMode && presets.length > 0 && (
                 <div className="relative group">
                     <select 
                        value={selectedPresetId}
                        onChange={(e) => setSelectedPresetId(e.target.value)}
                        className="bg-gray-800 border border-gray-700 text-xs text-gray-200 rounded px-2 py-1 outline-none focus:border-indigo-500 appearance-none pr-6 cursor-pointer"
                     >
                        {presets.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                     </select>
                     <ChevronRight size={12} className="absolute right-1 top-1.5 text-gray-500 pointer-events-none rotate-90" />
                 </div>
             )}
          </div>
          
          <div className="flex items-center gap-2">
            <button 
                onClick={() => {
                    setIsManageMode(!isManageMode);
                    if (!isManageMode && !editingPreset) {
                        // When entering manage mode, default to editing the currently selected preset
                        setEditingPreset(presets.find(p => p.id === selectedPresetId) || presets[0]);
                    }
                }}
                className={`p-1.5 rounded-full transition-colors ${isManageMode ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                title="预设设置"
            >
                <Settings2 size={18} />
            </button>
            <div className="w-[1px] h-4 bg-gray-700"></div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
            </button>
          </div>
        </div>
        
        {/* Body Switcher */}
        {isManageMode ? (
            /* --- MANAGE MODE --- */
            <div className="flex flex-1 overflow-hidden h-[500px]">
                {/* Sidebar */}
                <div className="w-1/3 border-r border-gray-800 bg-gray-900/50 flex flex-col">
                    <div className="p-2 border-b border-gray-800 flex justify-between items-center">
                        <span className="text-xs text-gray-500 font-bold uppercase">预设列表</span>
                        <button onClick={handleAddNewPreset} className="p-1 text-indigo-400 hover:bg-indigo-900/30 rounded" title="新建">
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {presets.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setEditingPreset(p)}
                                className={`w-full text-left px-3 py-2 rounded text-xs truncate transition-colors flex items-center justify-between group
                                    ${editingPreset?.id === p.id ? 'bg-indigo-900/40 text-white border border-indigo-500/30' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}
                                `}
                            >
                                <span>{p.name}</span>
                                {p.isDefault && <span className="text-[9px] bg-gray-700 px-1 rounded opacity-60">Def</span>}
                            </button>
                        ))}
                    </div>
                    <div className="p-2 border-t border-gray-800">
                        <button onClick={handleResetDefaults} className="w-full text-[10px] text-gray-500 hover:text-red-400 py-1 flex items-center justify-center gap-1">
                            <Undo2 size={10} /> 重置所有默认
                        </button>
                    </div>
                </div>

                {/* Editor */}
                <div className="flex-1 p-4 flex flex-col gap-4 bg-gray-900 overflow-y-auto custom-scrollbar">
                    {editingPreset ? (
                        <>
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500 uppercase font-bold">预设名称 (Name)</label>
                                <input 
                                    type="text" 
                                    value={editingPreset.name}
                                    onChange={e => setEditingPreset({...editingPreset, name: e.target.value})}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 outline-none"
                                />
                            </div>
                            <div className="space-y-1 flex-1 flex flex-col">
                                <label className="text-[10px] text-gray-500 uppercase font-bold">系统指令 (System Prompt)</label>
                                <textarea 
                                    value={editingPreset.systemPrompt}
                                    onChange={e => setEditingPreset({...editingPreset, systemPrompt: e.target.value})}
                                    className="flex-1 min-h-[200px] w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-indigo-500 outline-none resize-none custom-scrollbar leading-relaxed"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                {!editingPreset.isDefault && (
                                    <button 
                                        onClick={() => handleDeletePreset(editingPreset.id)}
                                        className="px-3 py-1.5 text-red-400 hover:bg-red-900/20 rounded text-xs flex items-center gap-1 border border-transparent hover:border-red-900/50"
                                    >
                                        <Trash2 size={12} /> 删除
                                    </button>
                                )}
                                <button 
                                    onClick={handleSavePreset}
                                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs flex items-center gap-1 shadow-lg"
                                >
                                    <Save size={12} /> 保存更改
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
                            选择左侧预设进行编辑
                        </div>
                    )}
                </div>
            </div>
        ) : (
            /* --- GENERATE MODE --- */
            <div className="p-5 space-y-4">
                {/* Context Preview */}
                <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        {selectedText ? '将要修改的内容 (Target)' : '将在光标处插入 (Insert At Cursor)'}
                    </label>
                    <div className="p-3 bg-gray-950/50 rounded-lg border border-gray-800 text-sm text-gray-300 font-mono max-h-24 overflow-y-auto custom-scrollbar italic">
                        {selectedText ? (
                            `"${selectedText}"`
                        ) : (
                            <span className="text-gray-600 flex items-center gap-1">
                                <span className="w-1.5 h-4 bg-indigo-500 animate-pulse block"></span> 
                                (当前位置)
                            </span>
                        )}
                    </div>
                </div>

                {/* Instruction Input */}
                <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-wider flex items-center gap-1">
                        <MessageSquare size={10} /> 你的要求 (Instruction)
                    </label>
                    <textarea 
                        ref={inputRef}
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none placeholder-gray-500"
                        placeholder={selectedText ? "例如：改为赛博朋克风格，增加霓虹灯光..." : "例如：添加一个穿着红色连衣裙的女孩，背景是森林..."}
                        disabled={isLoading}
                    />
                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                        <span>当前使用: {presets.find(p => p.id === selectedPresetId)?.name}</span>
                        <span>Enter 发送 · Shift+Enter 换行</span>
                    </div>
                </div>

                 {/* Footer (Only visible in Generate Mode) */}
                 <div className="pt-2 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                        disabled={isLoading}
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className={`
                            px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/20 font-medium
                            ${isLoading ? 'opacity-70 cursor-wait' : ''}
                        `}
                    >
                        {isLoading ? (
                            <>
                                <Wand2 size={16} className="animate-spin" />
                                思考中...
                            </>
                        ) : (
                            <>
                                <Wand2 size={16} />
                                生成提示词
                            </>
                        )}
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AIExpansionModal;
