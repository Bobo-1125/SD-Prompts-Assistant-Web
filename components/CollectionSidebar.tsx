
import React, { useState, useEffect, useRef } from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Plus, Trash2, X, Search } from 'lucide-react';
import { CollectionNode } from '../types';
import { collectionService } from '../services/collectionService';

interface CollectionSidebarProps {
  onClose: () => void;
  onInsert: (text: string) => void;
  refreshTrigger: number;
}

const CollectionSidebar: React.FC<CollectionSidebarProps> = ({ onClose, onInsert, refreshTrigger }) => {
  const [nodes, setNodes] = useState<CollectionNode[]>([]);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadNodes = () => {
      setNodes(collectionService.getCollections());
  };

  useEffect(() => {
    loadNodes();
  }, [refreshTrigger]);

  const handleToggleFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(collectionService.toggleFolder(id));
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除此项吗？(子内容也会被删除)')) {
      setNodes(collectionService.deleteNode(id));
    }
  };

  const handleCreateFolder = () => {
      if (!newFolderName.trim()) return;
      collectionService.addNode({
          id: Date.now().toString(),
          name: newFolderName,
          type: 'folder',
          children: [],
          createdAt: Date.now(),
          isOpen: true
      });
      setNewFolderName('');
      setIsAddingFolder(false);
      loadNodes();
  };

  // Helper to filter nodes based on search
  const filterNodes = (nodes: CollectionNode[]): CollectionNode[] => {
      if (!searchQuery) return nodes;
      return nodes.map(node => {
          if (node.type === 'item') {
              if (node.name.toLowerCase().includes(searchQuery.toLowerCase()) || node.content?.toLowerCase().includes(searchQuery.toLowerCase())) {
                  return node;
              }
              return null;
          }
          if (node.type === 'folder') {
              const filteredChildren = filterNodes(node.children || []);
              if (filteredChildren.length > 0 || node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                  return { ...node, children: filteredChildren, isOpen: true }; // Auto expand matched folders
              }
              return null;
          }
          return null;
      }).filter(Boolean) as CollectionNode[];
  };

  const renderTree = (items: CollectionNode[], depth = 0) => {
    if (!items || items.length === 0) {
        if (depth === 0 && searchQuery) return <div className="p-4 text-xs text-gray-500 text-center">无匹配结果</div>;
        return null;
    }
    return items.map(node => (
      <div key={node.id} className="select-none">
        <div 
          className={`
            flex items-center justify-between group
            px-2 py-1.5 rounded cursor-pointer transition-colors
            hover:bg-gray-800 text-sm border border-transparent hover:border-gray-700
          `}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={(e) => {
              if (node.type === 'folder') handleToggleFolder(node.id, e);
              else {
                  onInsert(node.content || '');
                  // Optional: Close on insert? User might want to insert multiple. Keeping it open.
              }
          }}
        >
          <div className="flex items-center gap-2 overflow-hidden flex-1">
             {node.type === 'folder' ? (
                 <span className="text-gray-500">
                     {node.isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                 </span>
             ) : (
                 <span className="w-3"></span>
             )}
             
             {node.type === 'folder' ? (
                 node.isOpen ? <FolderOpen size={14} className="text-indigo-400 shrink-0" /> : <Folder size={14} className="text-gray-400 shrink-0" />
             ) : (
                 <FileText size={14} className="text-emerald-500/80 shrink-0" />
             )}
             
             <span className={`truncate ${node.type === 'folder' ? 'font-medium text-gray-300' : 'text-gray-400'}`}>
                 {node.name}
             </span>
          </div>

          <button 
            onClick={(e) => handleDelete(node.id, e)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-gray-600 transition-opacity"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
        
        {node.type === 'folder' && node.isOpen && node.children && (
           <div>{renderTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  const displayNodes = filterNodes(nodes);

  return (
    <div className="absolute top-full left-0 mt-2 w-80 max-h-[600px] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-left overflow-hidden">
       
       {/* Header */}
       <div className="p-3 border-b border-gray-800 bg-gray-900 flex flex-col gap-2">
           <div className="flex items-center justify-between">
                <span className="font-bold text-gray-200 flex items-center gap-2 text-sm">
                    <Folder size={14} /> 收藏夹
                </span>
                <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                    {nodes.reduce((acc, n) => acc + (n.children ? n.children.length : 0) + 1, 0)} items
                </span>
           </div>
           
           {/* Search */}
           <div className="relative">
                <Search size={12} className="absolute left-2 top-2 text-gray-500" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="搜索收藏..."
                    className="w-full bg-gray-800 border border-gray-700 rounded pl-7 pr-2 py-1 text-xs text-gray-300 focus:border-indigo-500 outline-none"
                />
           </div>
       </div>

       {/* Tree Content */}
       <div className="flex-1 overflow-y-auto custom-scrollbar p-2 min-h-[150px]">
          {renderTree(displayNodes)}
       </div>

       {/* Footer: Add Folder */}
       <div className="p-2 border-t border-gray-800 bg-gray-900/50">
           {isAddingFolder ? (
               <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 p-1">
                   <input 
                      autoFocus
                      type="text" 
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      placeholder="文件夹名称..."
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
                      onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                   />
                   <div className="flex gap-2">
                       <button onClick={handleCreateFolder} className="flex-1 bg-indigo-600 text-white text-xs py-1 rounded hover:bg-indigo-500">确定</button>
                       <button onClick={() => setIsAddingFolder(false)} className="flex-1 bg-gray-800 text-gray-400 text-xs py-1 rounded hover:bg-gray-700">取消</button>
                   </div>
               </div>
           ) : (
               <button 
                onClick={() => setIsAddingFolder(true)}
                className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 text-xs py-1.5 rounded transition-colors"
               >
                   <Plus size={12} /> 新建文件夹
               </button>
           )}
       </div>
    </div>
  );
};

export default CollectionSidebar;
