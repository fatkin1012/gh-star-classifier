import { HiMagnifyingGlass, HiFunnel } from 'react-icons/hi2';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTag: string | null;
  allTags: string[];
  onTagFilter: (tag: string | null) => void;
}

export default function FilterBar({ searchQuery, onSearchChange, selectedTag, allTags, onTagFilter }: FilterBarProps) {
  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search repos..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      {/* Tag filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <HiFunnel className="w-3.5 h-3.5 text-gray-400" />
        <button
          onClick={() => onTagFilter(null)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            selectedTag === null
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
          }`}
        >
          All
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => onTagFilter(selectedTag === tag ? null : tag)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              selectedTag === tag
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
