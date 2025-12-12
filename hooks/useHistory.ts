
import { useState, useRef, useCallback } from 'react';

interface HistoryState {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

interface UseHistoryResult {
  state: string;
  set: (text: string, selectionStart?: number, selectionEnd?: number) => void; // Debounced update (for typing)
  push: (text: string, selectionStart?: number, selectionEnd?: number) => void; // Immediate push (for actions)
  undo: () => HistoryState | null;
  redo: () => HistoryState | null;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

// Maximum number of history steps to keep in memory
const MAX_HISTORY = 100;
// Debounce time for typing (ms)
const DEBOUNCE_TIME = 600;

export const useHistory = (initialState: string = ''): UseHistoryResult => {
  // The current text displayed in the UI
  const [present, setPresent] = useState<string>(initialState);
  
  // History Stack
  // We use refs because we don't want history mutations to trigger re-renders directly,
  // only the 'present' value change should trigger UI updates.
  const historyRef = useRef<HistoryState[]>([{ text: initialState, selectionStart: 0, selectionEnd: 0 }]);
  const pointerRef = useRef<number>(0);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to retrieve current cursor from active element if not provided
  const getCursor = (fallbackStart = 0, fallbackEnd = 0) => {
      // We rely on the caller passing these usually, but as a fallback/utility
      return { start: fallbackStart, end: fallbackEnd };
  };

  /**
   * Pushes a new state to history immediately.
   * Removes any "future" states if we were in the middle of the stack.
   */
  const push = useCallback((text: string, selectionStart = 0, selectionEnd = 0) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const currentIndex = pointerRef.current;
    const currentHistory = historyRef.current;

    // 1. If text hasn't changed from what's currently stored at the pointer, just update cursor
    if (currentHistory[currentIndex].text === text) {
        currentHistory[currentIndex].selectionStart = selectionStart;
        currentHistory[currentIndex].selectionEnd = selectionEnd;
        setPresent(text); // Ensure UI sync
        return;
    }

    // 2. Slice history to remove redo steps if we are not at the end
    const newHistory = currentHistory.slice(0, currentIndex + 1);

    // 3. Push new state
    newHistory.push({ text, selectionStart, selectionEnd });

    // 4. Cap size
    if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
    }

    historyRef.current = newHistory;
    pointerRef.current = newHistory.length - 1;
    
    setPresent(text);
  }, []);

  /**
   * Updates the current state (typing), but creates a history snapshot only after delay.
   * This feels like native browser undo: words/phrases are grouped.
   */
  const set = useCallback((text: string, selectionStart = 0, selectionEnd = 0) => {
    // 1. Update UI immediately
    setPresent(text);

    // 2. Debounce the history push
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
        const currentIndex = pointerRef.current;
        const lastEntry = historyRef.current[currentIndex];

        // Only push if text is actually different from the LAST SAVED snapshot
        if (lastEntry.text !== text) {
            push(text, selectionStart, selectionEnd);
        }
    }, DEBOUNCE_TIME);
  }, [push]);

  const undo = useCallback((): HistoryState | null => {
    if (pointerRef.current > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      
      pointerRef.current--;
      const prevState = historyRef.current[pointerRef.current];
      setPresent(prevState.text);
      return prevState;
    }
    return null;
  }, []);

  const redo = useCallback((): HistoryState | null => {
    if (pointerRef.current < historyRef.current.length - 1) {
      if (timerRef.current) clearTimeout(timerRef.current);

      pointerRef.current++;
      const nextState = historyRef.current[pointerRef.current];
      setPresent(nextState.text);
      return nextState;
    }
    return null;
  }, []);

  const clear = useCallback(() => {
      historyRef.current = [{ text: '', selectionStart: 0, selectionEnd: 0 }];
      pointerRef.current = 0;
      setPresent('');
  }, []);

  return {
    state: present,
    set,
    push,
    undo,
    redo,
    canUndo: pointerRef.current > 0,
    canRedo: pointerRef.current < historyRef.current.length - 1,
    clear
  };
};
