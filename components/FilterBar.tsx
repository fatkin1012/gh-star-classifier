import { HiMagnifyingGlass, HiFunnel } from 'react-icons/hi2';
import { CATEGORIES } from '../utils/classify';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTag: string | null;
  allTags: string[];
  onTagFilter: (tag: string | null) => void;

  // v1.1: Category filter
  activeCategory: string | null;
  onCategorySelect: (category: string | null) => void;
  activeSubCategory: string | null;
  onSubCategorySelect: (subCategory: string | null) => void;
  categoryCounts: Record<string, number>;
  uncategorizedCount: number;
}

export default function FilterBar({
  searchQuery,
  onSearchChange,
  selectedTag,
  allTags,
  onTagFilter,
  activeCategory,
  onCategorySelect,
  activeSubCategory,
  onSubCategorySelect,
  categoryCounts,
  uncategorizedCount,
}: FilterBarProps) {
  const activeCategoryObj = activeCategory
    ? CATEGORIES.find((c) => c.key === activeCategory)
    : null;

  function handleCategoryClick(catKey: string | null) {
    if (catKey === activeCategory) {
      onCategorySelect(null);
      onSubCategorySelect(null);
    } else {
      onCategorySelect(catKey);
      onSubCategorySelect(null);
    }
  }

  function handleSubCategoryClick(subKey: string) {
    if (subKey === activeSubCategory) {
      onSubCategorySelect(null);
    } else {
      onSubCategorySelect(subKey);
    }
  }

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

      {/* Main Category Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <HiFunnel className="w-3.5 h-3.5 text-gray-400" />
        <button
          onClick={() => handleCategoryClick(null)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            activeCategory === null && activeSubCategory === null
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
          }`}
        >
          All ({Object.values(categoryCounts).reduce((a, b) => a + b, 0) + uncategorizedCount})
        </button>
        {CATEGORIES.map((cat) => {
          const count = categoryCounts[cat.key] || 0;
          if (count === 0) return null;
          return (
            <button
              key={cat.key}
              onClick={() => handleCategoryClick(cat.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeCategory === cat.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {cat.icon} {cat.label.split('/')[0].trim()} ({count})
            </button>
          );
        })}
        {uncategorizedCount > 0 && (
          <button
            onClick={() => handleCategoryClick('uncategorized')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              activeCategory === 'uncategorized'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            ❓ Uncategorized ({uncategorizedCount})
          </button>
        )}
      </div>

      {/* Sub-Category Buttons */}
      {activeCategoryObj && activeCategoryObj.subCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 ml-2 pl-3 border-l-2 border-gray-200">
          <button
            onClick={() => handleSubCategoryClick('')}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              activeSubCategory === null || activeSubCategory === ''
                ? 'bg-gray-500 text-white border-gray-500'
                : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            All
          </button>
          {activeCategoryObj.subCategories.map((sub) => (
            <button
              key={sub.key}
              onClick={() => handleSubCategoryClick(sub.key)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                activeSubCategory === sub.key
                  ? 'bg-gray-500 text-white border-gray-500'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* Tag filters (collapsible) */}
      {allTags.length > 0 && (
        <details className="group">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform">▶</span>
            Custom tags ({allTags.length})
          </summary>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <button
              onClick={() => onTagFilter(null)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                selectedTag === null
                  ? 'bg-gray-600 text-white border-gray-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagFilter(selectedTag === tag ? null : tag)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  selectedTag === tag
                    ? 'bg-gray-600 text-white border-gray-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
