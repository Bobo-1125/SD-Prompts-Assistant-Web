
import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Save, Folder } from 'lucide-react';
import { CollectionNode } from '../types';
import { collectionService } from '../services/collectionService';

interface AddToCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  onSuccess: () => void;
}

const AddToCollectionModal: React.FC<AddToCollectionModalProps> = ({ isOpen, onClose, initialText, onSuccess }) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [folders, setFolders] = useState<CollectionNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setContent(initialText);
      // Generate a default name from the first few words
      const defaultName = initialText.length > 20 ? initialText.slice(0, 20) + '...' : initialText;
      setName(defaultName);
      
      const allFolders = collectionService.getAllFolders();
      setFolders(allFolders);
      if (allFolders.length > 0) setSelectedFolderId(allFolders[0].id);
    }
  }, [isOpen, initialText]);

  const handleSave = () => {
    if (!name.trim() || !content.trim() || !selectedFolderId) return;
    
    collectionService.addNode({
        id: Date.now().toString(),
        name: name.trim(),
        type: 'item',
        content: content.trim(),
        createdAt: Date.now()
    }, selectedFolderId);
    
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-850">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <FolderPlus size={18} className="text-emerald-400"/> 收藏提示词
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-5 space-y-4">
             <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase font-bold">收藏名称</label>
                <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:border-emerald-500 outline-none"
                    placeholder="给这段提示词起个名字..."
                    autoFocus
                />
            </div>

             <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase font-bold">保存到目录</label>
                <div className="relative">
                    <select 
                        value={selectedFolderId}
                        onChange={e => setSelectedFolderId(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:border-emerald-500 outline-none appearance-none"
                    >
                        {folders.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                    <Folder size={14} className="absolute right-3 top-3 text-gray-500 pointer-events-none" />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase font-bold">提示词内容</label>
                <textarea 
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    className="w-full h-24 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-emerald-500 outline-none font-mono resize-none custom-scrollbar"
                />
            </div>
        </div>

        <div className="p-4 bg-gray-850 border-t border-gray-800 flex justify-end gap-3">
             <button 
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
                取消
            </button>
            <button 
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20"
            >
                <Save size={16} /> 确定收藏
            </button>
        </div>
      </div>
    </div>
  );
};

export default AddToCollectionModal;
