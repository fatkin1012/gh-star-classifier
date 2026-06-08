import { useState, useRef, useEffect } from 'react';

interface TagInputProps {
  existingTags: string[];
  onAddTags: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export default function TagInput({ existingTags, onAddTags, suggestions = [], placeholder = 'Add tag...' }: TagInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const existingSet = new Set(existingTags);

  // Filter suggestions that aren't already used and match input
  const filteredSuggestions = suggestions
    .filter((s) => !existingSet.has(s) && s.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commitInput = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const tags = trimmed
      .split(/[,;，；\s]+/)
      .map((t) => t.trim())
      .filter((t) => t && !existingSet.has(t));
    if (tags.length > 0) {
      onAddTags(tags);
      setInput('');
    }
    setShowSuggestions(false);
    setHighlightIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && filteredSuggestions[highlightIdx]) {
        onAddTags([filteredSuggestions[highlightIdx]]);
        setInput('');
      } else {
        commitInput();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightIdx(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={commitInput}
          disabled={!input.trim()}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.map((s, i) => (
            <button
              key={s}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                i === highlightIdx ? 'bg-blue-50 font-medium' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onAddTags([s]);
                setInput('');
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
