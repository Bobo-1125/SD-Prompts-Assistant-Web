
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Wand2, Copy, Trash2, Layers, CheckCircle2, Loader2, Info, Settings, Languages, Sparkles, FolderHeart } from 'lucide-react';
import { parseSegmentsWithGemini } from './services/geminiService';
import { dictionaryService } from './services/dictionaryService';
import { PromptTag, CategoryDef, DEFAULT_CATEGORIES, SyntaxType, AIConfig, DEFAULT_AI_CONFIG, ShortcutConfig, DEFAULT_SHORTCUTS, COLOR_PALETTE, DictionaryEntry } from './types';
import TagItem from './components/TagItem';
import CategorySettings from './components/CategorySettings';
import CollectionSidebar from './components/CollectionSidebar';
import AddToCollectionModal from './components/AddToCollectionModal';

const App: React.FC = () => {
  const [input, setInput] = useState<string>('');
  const [tags, setTags] = useState<PromptTag[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [showTranslation, setShowTranslation] = useState<boolean>(true);
  
  // AI Config State
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    const saved = localStorage.getItem('comfyui_ai_config');
    return saved ? JSON.parse(saved) : DEFAULT_AI_CONFIG;
  });

  // Shortcut Config State
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(() => {
    const saved = localStorage.getItem('comfyui_shortcuts');
    return saved ? JSON.parse(saved) : DEFAULT_SHORTCUTS;
  });

  // Collections State
  const [isCollectionOpen, setIsCollectionOpen] = useState<boolean>(false);
  const [showAddToCollectionModal, setShowAddToCollectionModal] = useState<boolean>(false);
  const [addToCollectionData, setAddToCollectionData] = useState<string>('');
  const [collectionRefreshTrigger, setCollectionRefreshTrigger] = useState<number>(0);

  // Persist Configs
  useEffect(() => {
    localStorage.setItem('comfyui_ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    localStorage.setItem('comfyui_shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  // Interaction State
  const [hoveredTagIndex, setHoveredTagIndex] = useState<number | null>(null);
  const [isInteractionMode, setIsInteractionMode] = useState<boolean>(false);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, tag: PromptTag } | null>(null);

  // Autocomplete State
  const [suggestions, setSuggestions] = useState<Array<{ key: string } & DictionaryEntry>>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(0);
  const [suggestionPos, setSuggestionPos] = useState<{ top: number, left: number } | null>(null);

  // Cache: Maps RAW segment text -> Parsed Tag Data
  const tagCache = useRef<Map<string, Omit<PromptTag, 'id'>>>(new Map());

  // Refs
  const isUpdatingFromTags = useRef(false);
  const isPasting = useRef(false); // Ref to track paste state
  const dragItem = useRef<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Global Key Listeners for Interaction Mode (Ctrl/Meta Press)
  useEffect(() => {
    const handleKeyChange = (e: KeyboardEvent) => {
      // Allow either Control or Meta (Command) to trigger interaction mode
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsInteractionMode(e.type === 'keydown');
        if (e.type === 'keyup') setTooltip(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyChange);
    window.addEventListener('keyup', handleKeyChange);
    
    // Safety cleanup if window loses focus
    const handleBlur = () => {
        setIsInteractionMode(false);
        setTooltip(null);
    };
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyChange);
      window.removeEventListener('keyup', handleKeyChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Auto-scroll effect for suggestions list
  useEffect(() => {
    if (suggestionsRef.current && suggestions.length > 0) {
      const activeElement = suggestionsRef.current.children[activeSuggestionIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeSuggestionIndex, suggestions]);

  // Helper: Split input string into segments
  const splitInputToSegments = (text: string): string[] => {
    return text.split(/,|，|\n/).map(s => s.trim()).filter(s => s.length > 0);
  };

  // Helper: Generate a unique ID
  const generateId = () => `tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Helper: Detect Syntax Type locally
  const detectSyntax = (text: string): SyntaxType => {
    if (text.startsWith('<') && text.endsWith('>')) return SyntaxType.LORA;
    if (text.startsWith('{') && text.endsWith('}')) return SyntaxType.DYNAMIC;
    if ((text.startsWith('(') && text.endsWith(')')) || (text.startsWith('[') && text.endsWith(']'))) return SyntaxType.WEIGHTED;
    return SyntaxType.NORMAL;
  };

  // Helper: Clean text for dictionary lookup
  const cleanTextForLookup = (text: string): string => {
    let cleaned = text;
    cleaned = cleaned.replace(/^[\(\[\{<]+|[\)\]\}>]+$/g, '');
    cleaned = cleaned.split(':')[0];
    return cleaned.trim();
  };

  // --- Suggestion Logic ---
  const getCaretCoordinates = () => {
    const el = textareaRef.current;
    if (!el) return null;

    const { selectionStart } = el;
    const rect = el.getBoundingClientRect(); // Viewport-relative
    const style = window.getComputedStyle(el);
    
    const div = document.createElement('div');
    Array.from(style).forEach((prop) => {
        if (typeof prop === 'string') {
            div.style.setProperty(prop, style.getPropertyValue(prop));
        }
    });

    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.top = '0';
    div.style.left = '0';
    div.style.height = 'auto';
    div.style.width = el.clientWidth + 'px'; 
    div.textContent = el.value.substring(0, selectionStart);
    
    const span = document.createElement('span');
    span.textContent = '.'; // Dummy char to measure
    div.appendChild(span);

    document.body.appendChild(div);
    
    const { offsetLeft, offsetTop } = span;
    const { scrollTop, scrollLeft } = el;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;

    const top = rect.top + borderTop + offsetTop - scrollTop;
    const left = rect.left + borderLeft + offsetLeft - scrollLeft;

    document.body.removeChild(div);
    
    const lineHeight = parseFloat(style.lineHeight) || 20;

    return {
        left: left,
        top: top + lineHeight
    };
  };

  const updateSuggestions = (text: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const caretPos = el.selectionStart;
    let start = caretPos;
    while (start > 0) {
        const char = text[start - 1];
        if (char === ',' || char === '，' || char === '\n') break;
        start--;
    }
    
    const currentSegment = text.substring(start, caretPos).trim();

    if (currentSegment.length > 0) {
        const cleanQuery = currentSegment.replace(/^[\(\[\{<]+/, '');
        
        if (cleanQuery.length > 0) {
            let results = dictionaryService.search(cleanQuery);
            
            // Filter out exact matches (case-insensitive)
            // If user typed "1girl", don't suggest "1girl" anymore.
            results = results.filter(r => r.key.toLowerCase() !== cleanQuery.toLowerCase());

            if (results.length > 0) {
                const coords = getCaretCoordinates();
                if (coords) {
                    setSuggestions(results);
                    setActiveSuggestionIndex(0);
                    setSuggestionPos({ top: coords.top + 2, left: coords.left }); 
                    return;
                }
            }
        }
    }
    
    setSuggestions([]);
    setSuggestionPos(null);
  };

  const applySuggestion = (suggestion: { key: string }) => {
     const el = textareaRef.current;
     if (!el) return;
     
     const text = input;
     const caretPos = el.selectionStart;
     
     let start = caretPos;
     while (start > 0) {
        const char = text[start - 1];
        if (char === ',' || char === '，' || char === '\n') break;
        start--;
     }

     const prefix = text.substring(0, start);
     const suffix = text.substring(caretPos);
     
     const rawSegment = text.substring(start, caretPos);
     const syntaxStartMatch = rawSegment.match(/^[\(\[\{<]+/);
     const syntaxStart = syntaxStartMatch ? syntaxStartMatch[0] : '';

     const newText = prefix + syntaxStart + suggestion.key + suffix;
     
     setInput(newText);
     setSuggestions([]);
     setSuggestionPos(null);

     const newCaretPos = prefix.length + syntaxStart.length + suggestion.key.length;
     
     requestAnimationFrame(() => {
         if (textareaRef.current) {
             textareaRef.current.selectionStart = newCaretPos;
             textareaRef.current.selectionEnd = newCaretPos;
             textareaRef.current.focus();
         }
     });

     setTimeout(() => processInput(newText), 100);
  };

  // --- Collection Insertion ---
  const handleInsertFromCollection = (textToInsert: string) => {
      const el = textareaRef.current;
      if (!el) {
          const newInput = input + (input ? ', ' : '') + textToInsert;
          setInput(newInput);
          setTimeout(() => processInput(newInput), 100);
          return;
      }

      const text = input;
      const caretPos = el.selectionStart;
      const prefix = text.substring(0, caretPos);
      const suffix = text.substring(caretPos);
      
      let insertStr = textToInsert;
      if (prefix.trim().length > 0 && !prefix.trim().endsWith(',')) {
          insertStr = ', ' + insertStr;
      }
      if (suffix.trim().length > 0 && !suffix.trim().startsWith(',')) {
          insertStr = insertStr + ', ';
      }

      const newText = prefix + insertStr + suffix;
      setInput(newText);
      
      const newCaretPos = prefix.length + insertStr.length;
      
      requestAnimationFrame(() => {
          if (textareaRef.current) {
              textareaRef.current.selectionStart = newCaretPos;
              textareaRef.current.selectionEnd = newCaretPos;
              textareaRef.current.focus();
          }
      });
      
      setTimeout(() => processInput(newText), 100);
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
      const cached = tagCache.current.get(segment);
      if (cached) {
        newTags[index] = { ...cached, id: generateId() };
        return;
      }

      const syntax = detectSyntax(segment);
      const coreText = cleanTextForLookup(segment);
      const dictEntry = dictionaryService.lookup(coreText);

      if (dictEntry) {
        const tagData: Omit<PromptTag, 'id'> = {
          originalText: segment,
          englishText: dictEntry.translation === coreText ? segment : coreText,
          translation: dictEntry.translation,
          category: dictEntry.category,
          syntaxType: syntax,
          raw: segment,
          disabled: false,
          isRefreshing: false
        };
        
        tagCache.current.set(segment, tagData);
        newTags[index] = { ...tagData, id: generateId() };
      } else {
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
        const results = await parseSegmentsWithGemini(uniqueMissing, categories, aiConfig);
        const tagsToLearn: PromptTag[] = [];

        results.forEach(res => {
          const tagData = {
            originalText: res.originalText,
            englishText: res.englishText,
            translation: res.translation,
            category: res.category,
            syntaxType: res.syntaxType,
            raw: res.raw,
            disabled: false 
          };

          tagCache.current.set(res.raw, tagData);
          tagsToLearn.push({ ...tagData, id: 'temp' });
        });
        
        dictionaryService.learnBatch(tagsToLearn);

        const updatedTags = [...newTags];
        missingSegmentIndices.forEach(index => {
          const segmentRaw = rawSegments[index];
          const cached = tagCache.current.get(segmentRaw);
          if (cached) {
            updatedTags[index] = { ...cached, id: updatedTags[index].id, isRefreshing: false };
          } else {
             updatedTags[index] = { ...updatedTags[index], isRefreshing: false, category: 'Unknown' };
          }
        });

        setTags(updatedTags);

      } catch (error) {
        console.error("Failed to fetch segments", error);
        setTags(prev => prev.map(t => ({ ...t, isRefreshing: false })));
      }
    }
  }, [categories, aiConfig]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);
      
      // Only show suggestions if NOT pasting
      if (!isPasting.current) {
          updateSuggestions(val);
      } else {
          setSuggestions([]);
          setSuggestionPos(null);
      }
  };

  const handlePaste = () => {
      isPasting.current = true;
      // Reset paste flag after a short delay
      setTimeout(() => { isPasting.current = false; }, 100);
  };

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


  const handleRemoveTag = (id: string) => {
    const newTags = tags.filter(t => t.id !== id);
    setTags(newTags);
    updateInputFromTags(newTags);
  };

  const handleToggleTag = (tag: PromptTag) => {
    const newStatus = !tag.disabled;
    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, disabled: newStatus } : t));
    const cached = tagCache.current.get(tag.raw);
    if (cached) {
      tagCache.current.set(tag.raw, { ...cached, disabled: newStatus });
    }
  };

  const handleReloadTag = async (tagToReload: PromptTag) => {
    setTags(prev => prev.map(t => t.id === tagToReload.id ? { ...t, isRefreshing: true } : t));
    tagCache.current.delete(tagToReload.raw);

    try {
      const [result] = await parseSegmentsWithGemini([tagToReload.raw], categories, aiConfig);
      if (result) {
        tagCache.current.set(result.raw, {
            originalText: result.originalText,
            englishText: result.englishText,
            translation: result.translation,
            category: result.category,
            syntaxType: result.syntaxType,
            raw: result.raw,
            disabled: tagToReload.disabled
        });
        dictionaryService.learn({ ...result, id: 'temp' });
        setTags(prev => prev.map(t => t.id === tagToReload.id ? { ...result, id: t.id, isRefreshing: false } : t));
      }
    } catch (e) {
      console.error(e);
      setTags(prev => prev.map(t => t.id === tagToReload.id ? { ...t, isRefreshing: false } : t));
    }
  };

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
    setSuggestions([]);
  };

  const copyToClipboard = () => {
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

  const handleTextAreaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    // Hide suggestions on scroll as position might become invalid
    setSuggestions([]); 
  };

  const handleBackdropScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (textareaRef.current) {
        textareaRef.current.scrollTop = e.currentTarget.scrollTop;
        textareaRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const getTagRanges = (inputText: string) => {
    const ranges: {index: number, start: number, end: number}[] = [];
    const parts = inputText.split(/([,，\n]+)/);
    let currentPos = 0;
    let tagIdx = 0;
    
    parts.forEach(part => {
        const isDelimiter = part.match(/^[,，\n]+$/);
        const len = part.length;
        if (!isDelimiter && part.trim().length > 0) {
            ranges.push({
                index: tagIdx,
                start: currentPos,
                end: currentPos + len
            });
            tagIdx++;
        }
        currentPos += len;
    });
    return ranges;
  };

  const handleTextAreaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isModifier = e.ctrlKey || e.metaKey;
    
    // --- Autocomplete Navigation ---
    if (suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
            return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            applySuggestion(suggestions[activeSuggestionIndex]);
            return;
        }
        if (e.key === 'Escape') {
            setSuggestions([]);
            return;
        }
    }

    // --- Shortcuts ---
    // 1. Toggle Strikethrough (Ctrl + /)
    if (isModifier && e.key === shortcuts.toggleDisableKey) {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const ranges = getTagRanges(input);
        
        const idsToToggle = new Set<string>();
        
        if (start === end) {
            // Cursor Mode
            const target = ranges.find(r => start >= r.start && start <= r.end);
            if (target && tags[target.index]) {
                idsToToggle.add(tags[target.index].id);
            }
        } else {
            // Selection Mode
            ranges.forEach(r => {
                if (r.start < end && r.end > start) {
                     if (tags[r.index]) idsToToggle.add(tags[r.index].id);
                }
            });
        }
        
        if (idsToToggle.size > 0) {
            const newTags = tags.map(t => idsToToggle.has(t.id) ? { ...t, disabled: !t.disabled } : t);
            setTags(newTags);
            // Update cache
            newTags.forEach(t => {
                if (idsToToggle.has(t.id)) {
                    const cached = tagCache.current.get(t.raw);
                    if (cached) tagCache.current.set(t.raw, { ...cached, disabled: t.disabled });
                }
            });
        }
    }

    // 2. Add to Collection (Ctrl + J)
    if (isModifier && e.key === 'j') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const ranges = getTagRanges(input);
        
        const selectedTexts: string[] = [];
        const seenIds = new Set<string>();

        // Find overlapping tags with current selection
        ranges.forEach(r => {
             const isOverlap = (start === end) 
                ? (start >= r.start && start <= r.end)
                : (r.start < end && r.end > start);
             
             if (isOverlap && tags[r.index]) {
                 if (!seenIds.has(tags[r.index].id)) {
                     selectedTexts.push(tags[r.index].raw);
                     seenIds.add(tags[r.index].id);
                 }
             }
        });
        
        let textToSave = selectedTexts.join(', ');
        
        // Fallback: if no tags identified, use raw text selection
        if (!textToSave && start !== end) {
            textToSave = input.substring(start, end);
        }

        if (textToSave) {
            setAddToCollectionData(textToSave);
            setShowAddToCollectionModal(true);
            setIsCollectionOpen(true); // Open collection popover to show context
        }
    }
  };

  const handleSegmentHover = (e: React.MouseEvent, tagIndex: number) => {
      if (!isInteractionMode) return;
      const tag = tags[tagIndex];
      if (!tag) return;
      
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setTooltip({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
          tag: tag
      });
  };

  const highlightInput = (text: string) => {
    if (!text) return null;
    
    const segmentsAndDelimiters = text.split(/([,，\n]+)/);
    let tagIndexCounter = 0;

    return segmentsAndDelimiters.map((part, i) => {
        if (part.match(/^[,，\n]+$/)) {
            return <span key={i} className="text-amber-500/70 font-bold box-decoration-clone">{part}</span>;
        }
        
        if (!part.trim()) {
           return <span key={i}>{part}</span>;
        }

        const currentTagIndex = tagIndexCounter++;
        const tagState = tags[currentTagIndex];
        const isDisabled = tagState?.disabled;
        const isHovered = hoveredTagIndex === currentTagIndex;
        
        const interactionClass = isInteractionMode ? 'hover:bg-indigo-900/40 hover:outline hover:outline-1 hover:outline-indigo-500/50 cursor-help rounded-[2px]' : '';

        const innerContent = (() => {
           const regex = /(\<[^>]+?\>|\{[^}]+?\}|\([^)]+?\)|\[[^\]]+?\])/g;
           const subParts = part.split(regex);
           
           return subParts.map((sub, j) => {
              if (!sub) return null;
              let colorClass = 'text-gray-300';
              if (sub.startsWith('<') && sub.endsWith('>')) colorClass = 'text-rose-400';
              else if (sub.startsWith('{') && sub.endsWith('}')) colorClass = 'text-cyan-400';
              else if (sub.startsWith('(') && sub.endsWith(')')) colorClass = 'text-amber-400';
              else if (sub.startsWith('[') && sub.endsWith(']')) colorClass = 'text-indigo-400';
              return <span key={`${i}-${j}`} className={colorClass}>{sub}</span>
           });
        })();

        const hoverClass = isHovered 
            ? 'bg-indigo-600/50 ring-2 ring-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] z-10 rounded-sm' 
            : '';
        const disabledClass = isDisabled ? 'line-through text-gray-600 decoration-gray-500 opacity-60' : '';

        return (
            <span 
                key={i} 
                onMouseEnter={(e) => handleSegmentHover(e, currentTagIndex)}
                onMouseLeave={() => setTooltip(null)}
                className={`${hoverClass} ${disabledClass} ${interactionClass} transition-all duration-150 box-decoration-clone`}
            >
                {innerContent}
            </span>
        );
    });
  };

  const TagDetailTooltip = () => {
    if (!tooltip) return null;
    const { x, y, tag } = tooltip;
    const cat = categories.find(c => c.name === tag.category);
    const colorVal = COLOR_PALETTE.find(c => c.name === (cat?.color || 'slate'))?.value;

    return (
        <div 
            className="fixed z-[100] transform -translate-x-1/2 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
            style={{ left: x, top: y }}
        >
            <div className={`
                flex flex-col gap-1 p-2 rounded-lg shadow-xl border backdrop-blur-md
                ${colorVal ? colorVal.replace('/40', '/90') : 'bg-gray-800/90 border-gray-700 text-gray-200'}
            `}>
                 <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-1 mb-0.5">
                    <span className="text-[10px] uppercase font-bold opacity-80">{tag.category}</span>
                    <span className="text-[10px] font-mono opacity-60">{tag.syntaxType}</span>
                 </div>
                 <div className="font-bold text-sm">{tag.englishText}</div>
                 {tag.translation && tag.translation !== tag.englishText && (
                    <div className="text-xs opacity-90">{tag.translation}</div>
                 )}
            </div>
        </div>
    );
  };

  const typographyClasses = "font-mono text-sm leading-relaxed whitespace-pre-wrap break-words tracking-normal";

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-5 text-gray-200 font-sans relative">
      <TagDetailTooltip />
      
      {/* Suggestions Popover */}
      {suggestions.length > 0 && suggestionPos && (
          <div 
              ref={suggestionsRef}
              className="fixed z-[9999] w-72 max-h-80 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
              style={{ top: suggestionPos.top, left: suggestionPos.left }}
          >
              {suggestions.map((item, index) => (
                  <button
                      key={item.key}
                      onClick={() => applySuggestion(item)}
                      className={`
                          text-left px-2 py-1.5 text-xs border-b border-gray-800 last:border-0 flex flex-col
                          ${index === activeSuggestionIndex ? 'bg-indigo-900/50 text-white' : 'text-gray-300 hover:bg-gray-800'}
                      `}
                  >
                      <div className="flex items-center justify-between w-full">
                          <span className="font-bold truncate mr-2">{item.key}</span>
                          <span className="text-[9px] opacity-60 bg-gray-800 px-1 rounded whitespace-nowrap">{item.category}</span>
                      </div>
                      <span className="opacity-70 text-[10px] truncate">{item.translation}</span>
                  </button>
              ))}
          </div>
      )}

      {/* Global Click Outside for Collection Popover */}
      {isCollectionOpen && (
          <div className="fixed inset-0 z-30 bg-transparent" onClick={() => setIsCollectionOpen(false)}></div>
      )}

      {/* Add To Collection Modal */}
      <AddToCollectionModal 
        isOpen={showAddToCollectionModal}
        onClose={() => setShowAddToCollectionModal(false)}
        initialText={addToCollectionData}
        onSuccess={() => setCollectionRefreshTrigger(prev => prev + 1)}
      />

      {/* Header */}
      <header className="flex items-center justify-between pb-4 border-b border-gray-800/50 relative z-40">
        <div className="flex items-center gap-3">
          {/* Collection Dropdown Container */}
          <div className="relative">
              <button 
                onClick={() => setIsCollectionOpen(!isCollectionOpen)}
                className={`p-2 rounded-lg transition-colors ${isCollectionOpen ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                <FolderHeart size={20} />
              </button>
              
              {isCollectionOpen && (
                  <CollectionSidebar 
                    onClose={() => setIsCollectionOpen(false)} 
                    onInsert={handleInsertFromCollection}
                    refreshTrigger={collectionRefreshTrigger}
                  />
              )}
          </div>
          
          <div className="h-8 w-[1px] bg-gray-800 mx-1"></div>

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
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-all"
          title="设置 (Settings)"
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
              {isInteractionMode ? '交互模式: 悬浮查看详情' : `Ctrl/Cmd+J 收藏 · Ctrl/Cmd+${shortcuts.toggleDisableKey} 禁用`}
            </div>
          </div>
          
          <div className="relative flex-grow min-h-[250px] lg:min-h-[500px] bg-gray-900/50 rounded-xl border border-gray-700/50 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-inner overflow-hidden group">
            
            {/* Highlighter Backdrop */}
            <div 
                ref={backdropRef}
                onScroll={handleBackdropScroll}
                className={`
                    absolute inset-0 p-4 overflow-y-scroll custom-scrollbar
                    ${typographyClasses}
                    ${isInteractionMode ? 'pointer-events-auto z-20' : 'pointer-events-none z-0'}
                `}
                aria-hidden="true"
            >
                {highlightInput(input)}
            </div>

            {/* Actual Input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onScroll={handleTextAreaScroll}
              onKeyDown={handleTextAreaKeyDown}
              spellCheck={false}
              placeholder="在这里输入提示词，逗号分隔... (输入文字会自动联想)"
              className={`
                relative w-full h-full bg-transparent p-4 resize-none outline-none caret-white overflow-y-scroll custom-scrollbar
                ${typographyClasses}
                ${input ? 'text-transparent' : 'text-gray-300'} 
                ${isInteractionMode ? 'pointer-events-none z-0' : 'pointer-events-auto z-10'}
                placeholder-gray-600
              `}
            />

            {/* Floating Actions */}
            <div className="absolute bottom-3 right-3 flex gap-2 z-30 pointer-events-auto">
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
          aiConfig={aiConfig}
          setAiConfig={setAiConfig}
          shortcuts={shortcuts}
          setShortcuts={setShortcuts}
        />
      )}
    </div>
  );
};

export default App;
