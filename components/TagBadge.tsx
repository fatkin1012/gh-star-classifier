import { HiXMark } from 'react-icons/hi2';

interface TagBadgeProps {
  tag: string;
  onRemove?: (tag: string) => void;
  size?: 'sm' | 'md';
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

function getColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export default function TagBadge({ tag, onRemove, size = 'md' }: TagBadgeProps) {
  const color = getColor(tag);
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-0.5';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${color} ${sizeClass}`}>
      {tag}
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
