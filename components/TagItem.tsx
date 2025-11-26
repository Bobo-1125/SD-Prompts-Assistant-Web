import React from 'react';
import { PromptTag, SyntaxType, COLOR_PALETTE } from '../types';
import { X, RotateCw, Loader2, Ban } from 'lucide-react';

interface TagItemProps {
  tag: PromptTag;
  colorName: string;
  onRemove: (id: string) => void;
  onReload: (tag: PromptTag) => void;
  onToggle: (tag: PromptTag) => void;
  index?: number;
  onDragStart?: (e: React.DragEvent, index: number) => void;
  onDragEnter?: (e: React.DragEvent, index: number) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  showTranslation?: boolean;
  onMouseEnter?: (index: number) => void;
  onMouseLeave?: () => void;
}

const TagItem: React.FC<TagItemProps> = ({ 
  tag, 
  colorName, 
  onRemove,
  onReload,
  onToggle,
  index,
  onDragStart,
  onDragEnter,
  onDragEnd,
  showTranslation = true,
  onMouseEnter,
  onMouseLeave
}) => {
  
  // 1. Base Category Styles (Fallback)
  const categoryStyles = COLOR_PALETTE.find(c => c.name === colorName)?.value || COLOR_PALETTE[COLOR_PALETTE.length - 1].value;

  // 2. Syntax Specific Styles (Overrides)
  const getSyntaxStyles = (type: SyntaxType, raw: string) => {
    if (tag.isRefreshing) return '';

    switch (type) {
      case SyntaxType.LORA:
        return 'bg-rose-950/40 border-rose-500/60 text-rose-200 shadow-[0_0_8px_rgba(244,63,94,0.15)] font-medium';
      case SyntaxType.DYNAMIC:
        return 'bg-cyan-950/40 border-cyan-400/50 text-cyan-200 border-dashed border-[1.5px] font-medium';
      case SyntaxType.WEIGHTED:
        if (raw.trim().startsWith('(')) {
           return 'bg-amber-950/40 border-amber-500/60 text-amber-200 ring-1 ring-amber-500/10 font-bold';
        }
        if (raw.trim().startsWith('[')) {
           return 'bg-indigo-950/40 border-indigo-500/60 text-indigo-200 font-medium';
        }
        return 'bg-amber-950/40 border-amber-500/50 text-amber-200';
      default:
        return ''; 
    }
  };

  const syntaxStyles = getSyntaxStyles(tag.syntaxType, tag.raw);
  let finalStyles = syntaxStyles || categoryStyles;

  // 3. Disabled State Override
  if (tag.disabled) {
    finalStyles = 'bg-gray-800/50 border-gray-700/50 text-gray-500 line-through decoration-gray-500/50 grayscale opacity-75';
  }

  const isDraggable = typeof index === 'number' && !!onDragStart && !tag.isRefreshing;

  // 4. Text Display Logic
  // If showTranslation is FALSE, we show the Translation as the MAIN text (if available) to save space/context.
  // If showTranslation is TRUE, we show Raw/English as MAIN, and Translation as SUB.
  const hasTranslation = tag.translation && tag.translation.trim() !== '' && tag.translation !== tag.raw;
  
  const mainText = (!showTranslation && hasTranslation) 
    ? tag.translation 
    : (tag.raw || 'Analyzing...');

  const subText = (showTranslation && hasTranslation && !tag.disabled) 
    ? tag.translation 
    : null;

  return (
    <div 
      draggable={isDraggable}
      onDragStart={(e) => isDraggable && onDragStart && onDragStart(e, index!)}
      onDragEnter={(e) => isDraggable && onDragEnter && onDragEnter(e, index!)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => isDraggable && e.preventDefault()}
      onClick={() => onToggle(tag)}
      onMouseEnter={() => onMouseEnter && typeof index === 'number' && onMouseEnter(index)}
      onMouseLeave={() => onMouseLeave && onMouseLeave()}
      className={`
        relative group flex items-center
        pl-3 pr-3 py-1.5 rounded text-xs transition-all duration-200 select-none
        border cursor-pointer min-h-[36px]
        ${isDraggable ? 'active:cursor-grabbing' : ''}
        ${tag.isRefreshing ? 'opacity-70 cursor-wait bg-gray-800 border-gray-700 text-gray-400' : finalStyles}
      `}
    >
      {/* Smart Toolbar (Category + Actions) - Appears ABOVE the tag */}
      {!tag.isRefreshing && (
        // Added pb-2 to create an invisible bridge for the mouse to travel from tag to buttons without losing hover
        <div className="absolute bottom-full left-0 right-0 flex justify-center pb-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 pointer-events-none group-hover:pointer-events-auto transform translate-y-2 group-hover:translate-y-0">
           <div className="flex items-center gap-0.5 bg-gray-900 border border-gray-600/80 rounded-md shadow-xl p-0.5">
              {/* Category Badge */}
              <span className={`text-[9px] px-1.5 py-0.5 rounded text-gray-300 font-medium whitespace-nowrap`}>
                  {tag.category}
              </span>
              
              <div className="w-[1px] h-3 bg-gray-700 mx-0.5"></div>

              {/* Actions */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onReload(tag);
                }}
                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="重新分析 (Reload)"
              >
                <RotateCw size={10} />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(tag.id);
                }}
                className="p-1 text-gray-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
                title="删除 (Remove)"
              >
                <X size={10} />
              </button>
           </div>
        </div>
      )}

      {/* Content Section */}
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-2">
            {tag.isRefreshing ? (
               <Loader2 size={12} className="animate-spin text-indigo-400" />
            ) : null}
            <span className={`font-mono leading-tight break-all ${tag.disabled ? 'line-through opacity-80' : ''}`}>
              {mainText}
            </span>
        </div>
        
        {/* Translation Subtext */}
        {!tag.isRefreshing && subText && (
          <span className="text-[9px] opacity-60 font-sans mt-0.5 mix-blend-plus-lighter">
            {subText}
          </span>
        )}
      </div>
    </div>
  );
};

export default TagItem;