
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Wand2, Copy, Trash2, Layers, CheckCircle2, Loader2, Info, Settings, Languages } from 'lucide-react';
import { parseSegmentsWithGemini } from './services/geminiService';
import { dictionaryService } from './services/dictionaryService';
import { PromptTag, CategoryDef, DEFAULT_CATEGORIES, SyntaxType } from './types';
import TagItem from './components/TagItem';
import CategorySettings from './components/CategorySettings';

const App: React.FC = () => {
  const [input, setInput] = useState<string>('');
  const [tags, setTags] = useState<PromptTag[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [showTranslation, setShowTranslation] = useState<boolean>(true);

  // Interaction State
  const [hoveredTagIndex, setHoveredTagIndex] = useState<number | null>(null);

  // Cache: Maps RAW segment text -> Parsed Tag Data (without unique ID)
  // This is a session memory cache for exact string matches including syntax
  const tagCache = useRef<Map<string, Omit<PromptTag, 'id'>>>(new Map());

  // Refs for Drag & Drop and Input Sync
  const isUpdatingFromTags = useRef(false);
  const dragItem = useRef<number | null>(null);
  
  // Refs for Highlight Sync
  const backdropRef = useRef<HTMLDivElement>(null);

  // Helper: Split input string into segments
  const splitInputToSegments = (text: string): string[] => {
    return text.split(/,|，|\n/).map(s => s.trim()).filter(s => s.length > 0);
  };

  // Helper: Generate a unique ID
  const generateId = () => `tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Helper: Detect Syntax Type locally to aid Dictionary Lookup
  const detectSyntax = (text: string): SyntaxType => {
    if (text.startsWith('<') && text.endsWith('>')) return SyntaxType.LORA;
    if (text.startsWith('{') && text.endsWith('}')) return SyntaxType.DYNAMIC;
    if ((text.startsWith('(') && text.endsWith(')')) || (text.startsWith('[') && text.endsWith(']'))) return SyntaxType.WEIGHTED;
    return SyntaxType.NORMAL;
  };

  // Helper: Clean text for dictionary lookup (remove weights/brackets)
  const cleanTextForLookup = (text: string): string => {
    // Remove ( ), [ ], { }, < > and weights like :1.2
    // Simple heuristic: just look at the core word if possible. 
    // For "1girl", it's "1girl". For "(1girl:1.2)", we want "1girl".
    // Regex to strip outer brackets and potential weight
    let cleaned = text;
    // Strip weighting syntax like (text:1.2) or [text]
    cleaned = cleaned.replace(/^[\(\[\{<]+|[\)\]\}>]+$/g, '');
    // Remove weight part if exists (e.g. :1.2)
    cleaned = cleaned.split(':')[0];
    return cleaned.trim();
  };

  // CORE LOGIC: Process input changes
  const processInput = useCallback(async (currentInput: string) => {
    const rawSegments = splitInputToSegments(currentInput);
    if (rawSegments.length === 0) {
      setTags([]);
      return;
    }

    const newTags: PromptTag[] = [];
    const missingSegments: string[] = [];
    const missingSegmentIndices: number[] = [];

    // 1. First Pass: Resolve from Cache OR Dictionary
    rawSegments.forEach((segment, index) => {
      // A. Check Session Cache (Exact match including syntax)
      const cached = tagCache.current.get(segment);
      if (cached) {
        newTags[index] = { ...cached, id: generateId() };
        return;
      }

      // B. Check Dictionary (Fuzzy match on core content)
      // We need to parse syntax first so we don't mess up the visual type
      const syntax = detectSyntax(segment);
      const coreText = cleanTextForLookup(segment);
      const dictEntry = dictionaryService.lookup(coreText);

      if (dictEntry) {
        // Found in dictionary!
        const tagData: Omit<PromptTag, 'id'> = {
          originalText: segment,
          englishText: dictEntry.translation === coreText ? segment : coreText, // Use core text as english base
          translation: dictEntry.translation,
          category: dictEntry.category,
          syntaxType: syntax, // Use detected syntax (e.g. weighted), not dictionary syntax (usually normal)
          raw: segment,
          disabled: false,
          isRefreshing: false
        };
        
        // Add to cache so we don't lookup again this session
        tagCache.current.set(segment, tagData);
        newTags[index] = { ...tagData, id: generateId() };
      } else {
        // C. Not found anywhere -> Mark for AI
        missingSegments.push(segment);
        missingSegmentIndices.push(index);
        newTags[index] = {
          id: generateId(),
          raw: segment,
          originalText: segment,
          englishText: segment,
          translation: '...',
          category: '...',
          syntaxType: syntax,
          isRefreshing: true
        };
      }
    });

    setTags([...newTags]);

    // 2. Fetch missing segments from AI
    if (missingSegments.length > 0) {
      const uniqueMissing = Array.from(new Set(missingSegments));
      
      try {
        const results = await parseSegmentsWithGemini(uniqueMissing, categories);
        
        // 3. Process Results & Learn
        const tagsToLearn: PromptTag[] = [];

        results.forEach(res => {
          const tagData = {
            originalText: res.originalText,
            englishText: res.englishText,
            translation: res.translation,
            category: res.category,
            syntaxType: res.syntaxType,
            raw: res.raw,
            disabled: false // Default to enabled
          };

          // Update Session Cache
          tagCache.current.set(res.raw, tagData);
          
          // Queue for Dictionary Learning
          // We cast to PromptTag (with fake ID) for the learn function
          tagsToLearn.push({ ...tagData, id: 'temp' });
        });
        
        // Trigger Learning
        dictionaryService.learnBatch(tagsToLearn);

        // Update UI
        const updatedTags = [...newTags];
        missingSegmentIndices.forEach(index => {
          const segmentRaw = rawSegments[index];
          const cached = tagCache.current.get(segmentRaw);
          if (cached) {
            updatedTags[index] = { ...cached, id: updatedTags[index].id, isRefreshing: false };
          } else {
             // Fallback if AI somehow didn't return this specific segment (rare)
             updatedTags[index] = { ...updatedTags[index], isRefreshing: false, category: 'Unknown' };
          }
        });

        setTags(updatedTags);

      } catch (error) {
        console.error("Failed to fetch segments", error);
        setTags(prev => prev.map(t => ({ ...t, isRefreshing: false })));
      }
    }
  }, [categories]);

  // Debounce Effect for Input Typing
  useEffect(() => {
    if (isUpdatingFromTags.current) {
      isUpdatingFromTags.current = false;
      return;
    }
    const timer = setTimeout(() => {
      processInput(input);
    }, 800);
    return () => clearTimeout(timer);
  }, [input, processInput]);


  // Handle Tag Removal (Reverse Sync)
  const handleRemoveTag = (id: string) => {
    const newTags = tags.filter(t => t.id !== id);
    setTags(newTags);
    updateInputFromTags(newTags);
  };

  // Handle Tag Toggle (Disable/Enable)
  const handleToggleTag = (tag: PromptTag) => {
    const newStatus = !tag.disabled;
    
    // Update State
    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, disabled: newStatus } : t));
    
    // Update Cache so it persists if we re-parse (optional, but good UX for typing)
    const cached = tagCache.current.get(tag.raw);
    if (cached) {
      tagCache.current.set(tag.raw, { ...cached, disabled: newStatus });
    }
  };

  // Handle Tag Reload
  const handleReloadTag = async (tagToReload: PromptTag) => {
    setTags(prev => prev.map(t => t.id === tagToReload.id ? { ...t, isRefreshing: true } : t));
    tagCache.current.delete(tagToReload.raw);

    try {
      const [result] = await parseSegmentsWithGemini([tagToReload.raw], categories);
      if (result) {
        // Update Cache
        tagCache.current.set(result.raw, {
            originalText: result.originalText,
            englishText: result.englishText,
            translation: result.translation,
            category: result.category,
            syntaxType: result.syntaxType,
            raw: result.raw,
            disabled: tagToReload.disabled // Preserve disabled state
        });

        // Update Dictionary (Re-learning logic)
        dictionaryService.learn({ ...result, id: 'temp' });

        setTags(prev => prev.map(t => t.id === tagToReload.id ? { ...result, id: t.id, isRefreshing: false } : t));
      }
    } catch (e) {
      console.error(e);
      setTags(prev => prev.map(t => t.id === tagToReload.id ? { ...t, isRefreshing: false } : t));
    }
  };

  // Handle Drag Reorder
  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    if (dragItem.current === null) return;
    if (dragItem.current === index) return;

    const newTags = [...tags];
    const draggedTag = newTags[dragItem.current];
    newTags.splice(dragItem.current, 1);
    newTags.splice(index, 0, draggedTag);
    
    dragItem.current = index;
    setTags(newTags);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    dragItem.current = null;
    updateInputFromTags(tags);
  };

  const updateInputFromTags = (currentTags: PromptTag[]) => {
    isUpdatingFromTags.current = true;
    const newString = currentTags.map(t => t.raw).join(', ');
    setInput(newString);
  };

  const handleClear = () => {
    setInput('');
    setTags([]);
  };

  const copyToClipboard = () => {
    // Only copy enabled tags
    const activeTags = tags.filter(t => !t.disabled);
    if (!activeTags.length) return;
    
    const textToCopy = activeTags.map(t => t.englishText).join(', ');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryColor = (catName: string) => {
    const cat = categories.find(c => c.name === catName);
    return cat ? cat.color : 'slate';
  };

  // Sync Scroll for Highlighter
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Highlighter Logic
  const highlightInput = (text: string) => {
    if (!text) return null;
    
    // Split by commas/newlines but keep delimiters to render them
    const segmentsAndDelimiters = text.split(/([,，\n]+)/);
    let tagIndexCounter = 0;

    return segmentsAndDelimiters.map((part, i) => {
        // Render Delimiters
        if (part.match(/^[,，\n]+$/)) {
            return <span key={i} className="text-amber-500/70 font-bold">{part}</span>;
        }
        
        // Handle empty/whitespace parts (usually between adjacent delimiters)
        if (!part.trim()) {
           return <span key={i}>{part}</span>;
        }

        // Current Tag Logic
        const currentTagIndex = tagIndexCounter++;
        const tagState = tags[currentTagIndex];
        const isDisabled = tagState?.disabled;
        const isHovered = hoveredTagIndex === currentTagIndex;

        const innerContent = (() => {
           const regex = /(\<[^>]+?\>|\{[^}]+?\}|\([^)]+?\)|\[[^\]]+?\])/g;
           const subParts = part.split(regex);
           
           return subParts.map((sub, j) => {
              if (!sub) return null;
              let colorClass = 'text-gray-300';
              
              if (sub.startsWith('<') && sub.endsWith('>')) colorClass = 'text-rose-400 font-bold';
              else if (sub.startsWith('{') && sub.endsWith('}')) colorClass = 'text-cyan-400 font-bold';
              else if (sub.startsWith('(') && sub.endsWith(')')) colorClass = 'text-amber-400 font-bold';
              else if (sub.startsWith('[') && sub.endsWith(']')) colorClass = 'text-indigo-400 font-bold';

              return <span key={`${i}-${j}`} className={colorClass}>{sub}</span>
           });
        })();

        // Hover Effect Class - Enhanced Visibility
        const hoverClass = isHovered 
            ? 'bg-indigo-600/50 ring-2 ring-indigo-400 text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.5)] z-10 rounded-sm box-decoration-clone' 
            : '';
        const disabledClass = isDisabled ? 'line-through text-gray-600 decoration-gray-500 opacity-60' : '';

        return (
            <span key={i} className={`${hoverClass} ${disabledClass} transition-all duration-150`}>
                {innerContent}
            </span>
        );
    });
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-5 text-gray-200 font-sans">
      
      {/* Header */}
      <header className="flex items-center justify-between pb-4 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg shadow-purple-900/20">
            <Layers className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              ComfyUI 提示词助手
            </h1>
            <p className="text-xs text-gray-500">双向绑定 · 智能增量解析 · 本地词库加速</p>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-all"
          title="分类与词库设置"
        >
          <Settings size={20} />
        </button>
      </header>

      {/* Main Content */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full flex-grow">
        
        {/* Left Column: Input (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">原始输入 (Raw Input)</h2>
            <div className="text-[10px] text-gray-500 flex items-center gap-1 bg-gray-900 px-2 py-1 rounded-full border border-gray-800">
              <Info size={10} />
              划线为已禁用
            </div>
          </div>
          
          <div className="relative flex-grow min-h-[250px] lg:min-h-[500px] bg-gray-900/50 rounded-xl border border-gray-700/50 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-inner overflow-hidden group">
            
            {/* Highlighter Backdrop */}
            <div 
                ref={backdropRef}
                className="absolute inset-0 p-4 font-mono text-sm leading-relaxed pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
                aria-hidden="true"
            >
                {highlightInput(input)}
            </div>

            {/* Actual Input */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onScroll={handleScroll}
              spellCheck={false}
              placeholder="在这里输入提示词，逗号分隔...
例如: 1girl, red dress, (masterpiece:1.2), <lora:style:0.8>, {dynamic_prompt}"
              className={`
                relative z-10 w-full h-full bg-transparent p-4 resize-none outline-none font-mono text-sm leading-relaxed caret-white custom-scrollbar
                ${input ? 'text-transparent' : 'text-gray-300'} 
                placeholder-gray-600
              `}
            />
            
            {/* Floating Actions */}
            <div className="absolute bottom-3 right-3 flex gap-2 z-20">
              <button
                onClick={handleClear}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                title="清空"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Visualization (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
           <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">结构化标签 (Structured Tags)</h2>
            <div className="flex items-center gap-2">
              {/* Language Toggle */}
              <button 
                onClick={() => setShowTranslation(!showTranslation)}
                className={`p-1.5 rounded-full transition-colors ${showTranslation ? 'text-indigo-400 bg-indigo-900/30' : 'text-gray-500 hover:text-gray-300'}`}
                title={showTranslation ? "切换为仅中文 (Show Only Chinese)" : "切换为双语 (Show Bilingual)"}
              >
                 <Languages size={14} />
              </button>
              
              <div className="h-4 w-[1px] bg-gray-700 mx-1"></div>

              <span className="text-[10px] text-gray-500 hidden sm:block">
                单击禁用 · 拖拽排序
              </span>
              {tags.length > 0 && (
                 <button
                 onClick={copyToClipboard}
                 className={`
                   flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all
                   ${copied 
                     ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                     : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                   }
                 `}
               >
                 {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                 {copied ? '已复制' : '复制可用 Prompt'}
               </button>
              )}
            </div>
          </div>

          <div className="flex-grow min-h-[300px] bg-gray-950 rounded-xl border border-gray-800 p-4 relative shadow-inner flex flex-col">
            
            {tags.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700 gap-3 select-none">
                <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center border border-gray-800">
                  <Layers size={24} opacity={0.3} />
                </div>
                <p className="text-xs">等待输入... (Waiting for input)</p>
              </div>
            ) : (
              <div className="flex-grow content-start flex flex-wrap gap-2 animate-in fade-in duration-300">
                {tags.map((tag, index) => (
                  <TagItem 
                    key={tag.id} 
                    index={index}
                    tag={tag} 
                    colorName={getCategoryColor(tag.category)}
                    onRemove={handleRemoveTag}
                    onReload={handleReloadTag}
                    onToggle={handleToggleTag}
                    onDragStart={handleDragStart}
                    onDragEnter={handleDragEnter}
                    onDragEnd={handleDragEnd}
                    showTranslation={showTranslation}
                    onMouseEnter={setHoveredTagIndex}
                    onMouseLeave={() => setHoveredTagIndex(null)}
                  />
                ))}
              </div>
            )}
          </div>
          
          {/* Footer Preview for ComfyUI String */}
          {tags.length > 0 && (
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 p-3 flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <div className="text-[10px] uppercase text-gray-500 font-bold">ComfyUI 最终输出预览</div>
                <div className="text-[10px] text-gray-600 font-mono">
                  {tags.filter(t => !t.disabled).length} / {tags.length} tags
                </div>
              </div>
              <div className="text-xs font-mono text-gray-400 truncate opacity-80 select-all">
                {tags.filter(t => !t.disabled).map(t => t.englishText).join(', ')}
              </div>
            </div>
          )}
        </div>

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <CategorySettings 
          categories={categories} 
          setCategories={setCategories} 
          onClose={() => setShowSettings(false)} 
        />
      )}
    </div>
  );
};

export default App;
