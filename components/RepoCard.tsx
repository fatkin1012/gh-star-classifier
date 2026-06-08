import { useState } from 'react';
import { HiStar, HiCodeBracket } from 'react-icons/hi2';
import type { TaggedRepo } from '../utils/types';
import TagBadge from './TagBadge';
import TagInput from './TagInput';

interface RepoCardProps {
  repo: TaggedRepo;
  allTags: string[];
  onAddTags: (repoId: number, tags: string[]) => void;
  onRemoveTag: (repoId: number, tag: string) => void;
  selected?: boolean;
  onSelect?: (repoId: number) => void;
}

export default function RepoCard({ repo, allTags, onAddTags, onRemoveTag, selected, onSelect }: RepoCardProps) {
  const [showTagInput, setShowTagInput] = useState(false);

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        selected ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        {onSelect && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onSelect(repo.id)}
            className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        )}
        <img
          src={repo.ownerAvatar}
          alt={repo.owner}
          className="w-8 h-8 rounded-full mt-0.5 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sm text-blue-700 hover:underline truncate"
            >
              {repo.fullName}
            </a>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <HiStar className="w-3.5 h-3.5" />
              {repo.stars.toLocaleString()}
            </span>
            {repo.language && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <HiCodeBracket className="w-3.5 h-3.5" />
                {repo.language}
              </span>
            )}
          </div>
          {repo.description && (
            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{repo.description}</p>
          )}
          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {repo.tags.map((tag) => (
              <TagBadge
                key={tag}
                tag={tag}
                onRemove={(t) => onRemoveTag(repo.id, t)}
                size="sm"
              />
            ))}
            <button
              onClick={() => setShowTagInput(!showTagInput)}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100"
              title="Add tags"
            >
              + tag
            </button>
          </div>
          {showTagInput && (
            <div className="mt-2">
              <TagInput
                existingTags={repo.tags}
                onAddTags={(tags) => {
                  onAddTags(repo.id, tags);
                  setShowTagInput(false);
                }}
                suggestions={allTags}
                placeholder="Type tag name..."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
