import { useState } from 'react';
import type { TaggedRepo } from '../utils/types';
import RepoCard from './RepoCard';

interface RepoListProps {
  repos: TaggedRepo[];
  allTags: string[];
  onAddTags: (repoId: number, tags: string[]) => void;
  onRemoveTag: (repoId: number, tag: string) => void;
  onBulkTag: (repoIds: number[], tags: string[]) => void;
}

export default function RepoList({ repos, allTags, onAddTags, onRemoveTag, onBulkTag }: RepoListProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState('');

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === repos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(repos.map((r) => r.id)));
    }
  };

  const handleBulkTag = () => {
    const tags = bulkTagInput
      .split(/[,;，；\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0 || selected.size === 0) return;
    onBulkTag([...selected], tags);
    setBulkTagInput('');
    setSelected(new Set());
  };

  return (
    <div className="space-y-2">
      {/* Bulk actions bar */}
      {repos.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={repos.length > 0 && selected.size === repos.length}
              onChange={selectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Select all ({repos.length})
          </label>
          {selected.size > 0 && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs text-blue-600 font-medium whitespace-nowrap">{selected.size} selected</span>
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBulkTag()}
                placeholder="Tags (e.g. ml, frontend)..."
                className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleBulkTag}
                disabled={!bulkTagInput.trim()}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Tag All
              </button>
            </div>
          )}
        </div>
      )}

      {/* Repo cards */}
      {repos.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-lg">No repos found</p>
          <p className="text-sm mt-1">Sync your GitHub stars to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              allTags={allTags}
              onAddTags={onAddTags}
              onRemoveTag={onRemoveTag}
              selected={selected.has(repo.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
