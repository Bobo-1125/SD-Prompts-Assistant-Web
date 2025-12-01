
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Wand2, Copy, Trash2, Layers, CheckCircle2, Loader2, Info, Settings, Languages, Sparkles, FolderHeart, Palette } from 'lucide-react';
import { parseSegmentsWithGemini, expandPromptWithGemini } from './services/geminiService';
import { dictionaryService } from './services/dictionaryService';
import { PromptTag, CategoryDef, DEFAULT_CATEGORIES, SyntaxType, AIConfig, DEFAULT_AI_CONFIG, ShortcutConfig, DEFAULT_SHORTCUTS, COLOR_PALETTE, DictionaryEntry } from './types';
import TagItem from './components/TagItem';
import CategorySettings from './components/CategorySettings';
import CollectionSidebar from './components/CollectionSidebar';
import AddToCollectionModal from './components/AddToCollectionModal';
import AIExpansionModal from './components/AIExpansionModal';

const App: React.FC = () => {
  const [input, setInput] = useState<string>('');
  const [tags, setTags] = useState<PromptTag[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [showTranslation, setShowTranslation] = useState<boolean>(true);
  
  // Highlight Toggle State
  const [enableHighlighting, setEnableHighlighting] = useState<boolean>(() => {
    return localStorage.getItem('comfyui_highlighting') === 'true';
  });

  // Language Toggle State for Input
  const [isInputChinese, setIsInputChinese] = useState<boolean>(false);

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

  // AI Expansion State
  const [showExpansionModal, setShowExpansionModal] = useState<boolean>(false);
  const [expansionRange, setExpansionRange] = useState<{start: number, end: number, text: string} | null>(null);
  const [isExpanding, setIsExpanding] = useState<boolean>(false);

  // Persist Configs
  useEffect(() => {
    localStorage.setItem('comfyui_ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    localStorage.setItem('comfyui_shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    localStorage.setItem('comfyui_highlighting', String(enableHighlighting));
  }, [enableHighlighting]);

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
  
  // Track previous tags to detect deletions and reset cache state
  const prevTagsRef = useRef<PromptTag[]>([]);

  // Race Condition Fix: Track the latest input to prevent stale async updates
  const latestInputRef = useRef<string>(input);
  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);

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

  // Helper: Get text color class based on category color name
  const getCategoryTextColor = (color: string) => {
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
      case 'slate': return 'text-slate-400';
      default: return 'text-gray-300';
    }
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

  // --- AI Expansion Handlers ---
  const handleExpansionRequest = (instruction: string) => {
      if (!expansionRange) return;
      setIsExpanding(true);

      expandPromptWithGemini(input, expansionRange.text, instruction, aiConfig)
        .then(newText => {
            const el = textareaRef.current;
            if (!el) return;

            const originalText = input;
            const prefix = originalText.substring(0, expansionRange.start);
            const suffix = originalText.substring(expansionRange.end);

            let finalTextToInsert = newText;
            
            // Logic for comma handling
            if (expansionRange.start === expansionRange.end) {
                 // Insertion mode: Check if we need commas
                 if (prefix.trim() && !prefix.trim().endsWith(',')) finalTextToInsert = ', ' + finalTextToInsert;
                 if (suffix.trim() && !suffix.trim().startsWith(',')) finalTextToInsert = finalTextToInsert + ', ';
            }
            
            const updatedInput = prefix + finalTextToInsert + suffix;
            setInput(updatedInput);
            
            // Move caret to end of inserted text
            const newCaretPos = prefix.length + finalTextToInsert.length;
             requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = newCaretPos;
                    textareaRef.current.selectionEnd = newCaretPos;
                    textareaRef.current.focus();
                }
            });

            // Refresh analysis
            processInput(updatedInput);
            setShowExpansionModal(false);
        })
        .catch(err => {
            alert("AI Expansion Failed: " + err.message);
        })
        .finally(() => {
            setIsExpanding(false);
        });
  };

  // CORE LOGIC: Process input changes
  const processInput = useCallback(async (currentInput: string) => {
    const rawSegments = splitInputToSegments(currentInput);
    
    // DIFF Logic: Identify removed tags that were disabled and reset their cache status
    const currentRawSet = new Set(rawSegments);
    prevTagsRef.current.forEach(prevTag => {
        // If a tag was previously disabled AND it is no longer in the current input
        if (prevTag.disabled && !currentRawSet.has(prevTag.raw)) {
            const cached = tagCache.current.get(prevTag.raw);
            if (cached) {
                // Reset disabled state to false so it re-appears enabled if typed again
                tagCache.current.set(prevTag.raw, { ...cached, disabled: false });
            }
        }
    });

    if (rawSegments.length === 0) {
      setTags([]);
      prevTagsRef.current = [];
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
    prevTagsRef.current = newTags; // Update reference for next diff

    // 2. Fetch missing segments from AI
    if (missingSegments.length > 0) {
      const uniqueMissing = Array.from(new Set(missingSegments));
      
      try {
        // Callback to show Baidu Results immediately
        const onProgress = (translations: string[]) => {
            // Race check: if input has changed, abandon update
            if (latestInputRef.current !== currentInput) return;

            setTags(prevTags => {
                const nextTags = [...prevTags];
                // Map uniqueMissing string -> translation
                const transMap = new Map<string, string>();
                uniqueMissing.forEach((seg, idx) => {
                    if (translations[idx]) transMap.set(seg, translations[idx]);
                });

                // Update tags that are still refreshing and match the raw text
                const updated = nextTags.map(t => {
                    if (t.isRefreshing && transMap.has(t.raw)) {
                        const hint = transMap.get(t.raw)!;
                        // Check if hint is Chinese (implies En -> Zh translation occurred)
                        // If hint is ASCII, it likely means we translated Zh -> En
                        const isHintChinese = /[\u4e00-\u9fa5]/.test(hint);
                        
                        if (isHintChinese) {
                             return { ...t, translation: hint };
                        } else {
                             // Hint is English (implies Zh -> En translation occurred)
                             // Set English text for immediate feedback
                             // And set translation to raw (original Chinese)
                             return { ...t, englishText: hint, translation: t.raw };
                        }
                    }
                    return t;
                });
                
                prevTagsRef.current = updated;
                return updated;
            });
        };

        const results = await parseSegmentsWithGemini(uniqueMissing, categories, aiConfig, onProgress);
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

        // RACE CONDITION FIX:
        // Check if the input has changed while we were waiting for AI.
        if (latestInputRef.current !== currentInput) {
             return;
        }

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
        prevTagsRef.current = updatedTags;

      } catch (error) {
        console.error("Failed to fetch segments", error);
        // Only turn off refreshing if we are still on the same input
        if (latestInputRef.current === currentInput) {
            setTags(prev => {
                const updated = prev.map(t => ({ ...t, isRefreshing: false }));
                prevTagsRef.current = updated;
                return updated;
            });
        }
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

  const handleLanguageToggle = () => {
    const nextIsChinese = !isInputChinese;
    
    // Split preserving delimiters to reconstruct the exact string structure
    const parts = input.split(/([,，\n]+)/);
    let tagIndex = 0;
    
    const cacheUpdates = new Map<string, Omit<PromptTag, 'id'>>();

    const newParts = parts.map(part => {
         // If it's a delimiter or empty, return as is
         if (part.match(/^[,，\n]+$/) || !part.trim()) return part;
         
         const currentTag = tags[tagIndex];
         tagIndex++;
         
         // Safety check: if tags are out of sync or refreshing, keep original text
         if (!currentTag || currentTag.isRefreshing) return part;

         // Check if we have the target data
         const hasTranslation = currentTag.translation && currentTag.translation !== '...';
         const hasEnglish = currentTag.englishText;

         if (nextIsChinese && !hasTranslation) return part;
         if (!nextIsChinese && !hasEnglish) return part;

         // Determine target text
         // If switching to Chinese, use translation. If switching to English, use englishText.
         const targetText = nextIsChinese ? currentTag.translation : currentTag.englishText;
         
         // Preserve leading/trailing whitespace of the segment
         const match = part.match(/^(\s*)(.*?)(\s*)$/);
         const prefix = match ? match[1] : '';
         const suffix = match ? match[3] : '';
         
         // Pre-fill cache for the NEW text (targetText)
         // This ensures that when processInput runs on the new text, it finds the data immediately.
         const newCacheData = {
             ...currentTag,
             raw: targetText, 
             // IMPORTANT: We preserve the semantic data regardless of display language
             // When displaying Chinese (raw=translation), englishText remains "1girl".
             // When displaying English (raw=englishText), translation remains "1个女孩".
         };
         
         cacheUpdates.set(targetText, newCacheData);

         return prefix + targetText + suffix;
    });

    // Apply cache updates synchronously
    cacheUpdates.forEach((val, key) => {
        tagCache.current.set(key, val);
    });

    const newInput = newParts.join('');
    
    // Update ref immediately to prevent race condition logic in processInput from blocking this
    latestInputRef.current = newInput;
    
    setInput(newInput);
    setIsInputChinese(nextIsChinese);
    
    // processInput will be triggered by useEffect, and it will hit the cache we just populated.
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
    const tagToRemove = tags.find(t => t.id === id);
    if (tagToRemove) {
        // Reset disabled status in cache immediately
        const cached = tagCache.current.get(tagToRemove.raw);
        if (cached) {
            tagCache.current.set(tagToRemove.raw, { ...cached, disabled: false });
        }
    }
    
    const newTags = tags.filter(t => t.id !== id);
    setTags(newTags);
    updateInputFromTags(newTags);
    // processInput will run due to input change and update prevTagsRef
  };

  const handleToggleTag = (tag: PromptTag) => {
    const newStatus = !tag.disabled;
    setTags(prev => {
        const updated = prev.map(t => t.id === tag.id ? { ...t, disabled: newStatus } : t);
        prevTagsRef.current = updated;
        return updated;
    });
    const cached = tagCache.current.get(tag.raw);
    if (cached) {
      tagCache.current.set(tag.raw, { ...cached, disabled: newStatus });
    }
  };

  const handleReloadTag = async (tagToReload: PromptTag) => {
    setTags(prev => prev.map(t => t.id === tagToReload.id ? { ...t, isRefreshing: true } : t));
    tagCache.current.delete(tagToReload.raw);

    try {
      const onProgress = (translations: string[]) => {
           const hint = translations[0];
           if (hint) {
               const isHintChinese = /[\u4e00-\u9fa5]/.test(hint);
               setTags(prev => prev.map(t => {
                   if (t.id === tagToReload.id) {
                       if (isHintChinese) return { ...t, translation: hint };
                       else return { ...t, englishText: hint, translation: t.raw };
                   }
                   return t;
               }));
           }
      };
      
      const [result] = await parseSegmentsWithGemini([tagToReload.raw], categories, aiConfig, onProgress);
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
        setTags(prev => {
            const updated = prev.map(t => t.id === tagToReload.id ? { ...result, id: t.id, isRefreshing: false } : t);
            prevTagsRef.current = updated;
            return updated;
        });
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
    prevTagsRef.current = newTags;
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
    prevTagsRef.current = [];
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
            prevTagsRef.current = newTags;
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

    // 3. AI Expansion / Magic Rewrite (Ctrl + L)
    if (isModifier && e.key === 'l') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        const selectedText = input.substring(start, end);
        
        setExpansionRange({
            start,
            end,
            text: selectedText
        });
        setShowExpansionModal(true);
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

        // Calculate Category Color if highlighting is enabled
        let categoryColorClass = '';
        if (enableHighlighting && tagState && !isDisabled) {
           const cat = categories.find(c => c.name === tagState.category);
           categoryColorClass = getCategoryTextColor(cat?.color || 'slate');
        }

        const innerContent = (() => {
           // If category highlighting is enabled, we skip the specific syntax coloring 
           // and simply render the text so it inherits the parent's category color.
           if (enableHighlighting) {
               return part;
           }

           // Default Syntax highlighting logic
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
                className={`${hoverClass} ${disabledClass} ${interactionClass} ${categoryColorClass} transition-all duration-150 box-decoration-clone`}
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

      {/* AI Expansion Modal */}
      <AIExpansionModal 
        isOpen={showExpansionModal}
        onClose={() => setShowExpansionModal(false)}
        selectedText={expansionRange?.text || ''}
        fullContext={input}
        onConfirm={handleExpansionRequest}
        isLoading={isExpanding}
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
            <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">原始输入 (Raw Input)</h2>
                
                <div className="flex items-center bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
                    <button 
                      onClick={() => setEnableHighlighting(!enableHighlighting)}
                      className={`p-1 rounded-md transition-colors ${enableHighlighting ? 'text-indigo-400 bg-indigo-900/30' : 'text-gray-500 hover:text-gray-300'}`}
                      title={enableHighlighting ? "关闭分类颜色高亮" : "开启分类颜色高亮"}
                    >
                      <Palette size={14} />
                    </button>
                    <div className="w-[1px] h-3 bg-gray-700 mx-0.5"></div>
                    <button 
                      onClick={handleLanguageToggle}
                      className={`p-1 rounded-md transition-colors ${isInputChinese ? 'text-emerald-400 bg-emerald-900/30' : 'text-gray-500 hover:text-gray-300'}`}
                      title={isInputChinese ? "切换回英文显示 (Revert to English)" : "切换为中文显示 (Translate to Chinese)"}
                    >
                      <Languages size={14} />
                    </button>
                </div>
            </div>
            <div className="text-[10px] text-gray-500 flex items-center gap-1 bg-gray-900 px-2 py-1 rounded-full border border-gray-800">
              <Info size={10} />
              {isInteractionMode ? '交互模式: 悬浮查看详情' : `Ctrl+J 收藏 · Ctrl+L AI扩写`}
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
