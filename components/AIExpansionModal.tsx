
import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Wand2, MessageSquare } from 'lucide-react';

interface AIExpansionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  fullContext: string; // The surrounding text for AI context
  onConfirm: (instruction: string) => void;
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInstruction('');
      // Focus after animation
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (isLoading) return;
    onConfirm(instruction);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-indigo-500/30 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 ring-1 ring-indigo-500/20">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-850 bg-gradient-to-r from-gray-900 to-indigo-900/20">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-400 fill-indigo-400/20"/> 
            AI 智能扩写 / 重写
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
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
                    className="w-full h-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none placeholder-gray-500"
                    placeholder={selectedText ? "例如：改为赛博朋克风格，增加霓虹灯光..." : "例如：添加一个穿着红色连衣裙的女孩，背景是森林..."}
                    disabled={isLoading}
                />
                <div className="text-[10px] text-gray-500 text-right">Enter 发送 · Shift+Enter 换行</div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-850 border-t border-gray-800 flex justify-end gap-3">
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
    </div>
  );
};

export default AIExpansionModal;
