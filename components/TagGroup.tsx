import React from 'react';
import { PromptTag, DEFAULT_CATEGORIES } from '../types';
import TagItem from './TagItem';

interface TagGroupProps {
  category: string;
  tags: PromptTag[];
  onRemove: (id: string) => void;
  onReload: (tag: PromptTag) => void;
  onToggle: (tag: PromptTag) => void;
}

const TagGroup: React.FC<TagGroupProps> = ({ category, tags, onRemove, onReload, onToggle }) => {
  if (tags.length === 0) return null;

  // Resolve color from category name using default categories
  const categoryDef = DEFAULT_CATEGORIES.find(c => c.name === category);
  const colorName = categoryDef ? categoryDef.color : 'slate';

  const getHeaderColor = (color: string) => {
    switch(color) {
      case 'blue': return 'text-blue-400';
      case 'purple': return 'text-purple-400';
      case 'emerald': return 'text-emerald-400';
      case 'rose': return 'text-rose-400';
      case 'amber': return 'text-amber-400';
      case 'cyan': return 'text-cyan-400';
      case 'pink': return 'text-pink-400';
      case 'indigo': return 'text-indigo-400';
      case 'teal': return 'text-teal-400';
      case 'orange': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="mb-6">
      <h3 className={`text-xs font-bold uppercase tracking-widest mb-3 ${getHeaderColor(colorName)} flex items-center gap-2`}>
        {category}
        <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full text-[10px]">
          {tags.length}
        </span>
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map(tag => (
          <TagItem 
            key={tag.id} 
            tag={tag} 
            colorName={colorName} 
            onRemove={onRemove}
            onReload={onReload}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
};

export default TagGroup;