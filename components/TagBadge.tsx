import { HiXMark } from 'react-icons/hi2';
import { getCategoryInfo } from '../utils/classify';

interface TagBadgeProps {
  tag: string;
  onRemove?: (tag: string) => void;
  size?: 'sm' | 'md';
  // Category badge variant
  category?: string;    // category key for styled category badge
  subCategory?: string; // optional sub-category key
}

const COLOR_PALETTE = [
  'bg-blue-100 text-blue-800',
  'bg-green-100 text-green-800',
  'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800',
  'bg-pink-100 text-pink-800',
  'bg-cyan-100 text-cyan-800',
  'bg-orange-100 text-orange-800',
  'bg-teal-100 text-teal-800',
  'bg-indigo-100 text-indigo-800',
  'bg-rose-100 text-rose-800',
];

const CATEGORY_COLORS: Record<string, string> = {
  'applications-tools': 'bg-green-100 text-green-800',
  'libraries-frameworks': 'bg-blue-100 text-blue-800',
  'boilerplates-starters': 'bg-orange-100 text-orange-800',
  'awesome-lists-tutorials': 'bg-pink-100 text-pink-800',
  'scripts-dotfiles': 'bg-purple-100 text-purple-800',
  'uncategorized': 'bg-gray-100 text-gray-500',
};

function getColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export default function TagBadge({ tag, category, subCategory, onRemove, size = 'sm' }: TagBadgeProps) {
  let color: string;

  if (category) {
    color = CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-500';
  } else {
    color = getColor(tag);
  }

  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-0.5';
  const catInfo = category ? getCategoryInfo(category) : null;
  const displayText = subCategory
    ? subCategory.replace(/-/g, ' ')
    : (catInfo ? `${catInfo.icon} ${catInfo.label.split('/')[0].trim()}` : tag);

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${color} ${sizeClass}`}>
      {catInfo?.icon && !subCategory && (
        <span className="text-[10px]">{catInfo.icon}</span>
      )}
      {displayText}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"
          title={`Remove "${tag}"`}
        >
          <HiXMark className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

export { CATEGORY_COLORS };
