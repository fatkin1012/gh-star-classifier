import { useState, useEffect } from 'react';
import { HiStar, HiCodeBracket, HiSparkles, HiArrowPath } from 'react-icons/hi2';
import type { TaggedRepo } from '../utils/types';
import TagBadge from './TagBadge';
import TagInput from './TagInput';
import { getSettings, getAiCache, setAiCache } from '../utils/db';
import { classifyRepoWithLLM, fetchReadmeSummary } from '../utils/llm';
import { classifyRepoSync, getCategoryInfo, getSubCategoryLabel } from '../utils/classify';
import { getSettings, getAiCache, setAiCache, reclassifyRepo } from '../utils/db';
import { analyzeRepo, fetchReadmeSummary } from '../utils/llm';
import { getCategoryInfo, getSubCategoryLabel, getConfidenceColor, getConfidenceLabel } from '../utils/classify';


interface RepoCardProps {
  repo: TaggedRepo;
  allTags: string[];
  onAddTags: (repoId: number, tags: string[]) => void;
  onRemoveTag: (repoId: number, tag: string) => void;
  selected?: boolean;
  onSelect?: (repoId: number) => void;
  onAiSuggest?: (repoId: number, tags: string[]) => void;
}

export default function RepoCard({ repo, allTags, onAddTags, onRemoveTag, selected, onSelect, onAiSuggest }: RepoCardProps) {
  const [showTagInput, setShowTagInput] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Load cached AI suggestion on mount (legacy — may have tags from older versions)
  useEffect(() => {
    getAiCache(repo.id).then((cached) => {
      if (cached && cached.tags && cached.tags.length > 0) {
        setAiSuggestion(cached.tags);
      }
    });
  }, [repo.id]);

  // v1.5: AI button now does classification, not tag suggestion
  const handleAiClassify = async () => {
    setAiAnalyzing(true);
    setAiError(null);
    try {
      const settings = await getSettings();
      if (!settings.llm.apiKey) {
        setAiError('Configure LLM API key in Settings first');
        setAiAnalyzing(false);
        return;
      }

      const readmeSummary = await fetchReadmeSummary(repo);
      const suggestion = await classifyRepoWithLLM(repo, readmeSummary, settings.llm);

      // Cache the result
      await setAiCache(repo.id, { ...suggestion, analyzedAt: Date.now() });

      // v1.5: Only update category/subCategory
      if (suggestion.category && suggestion.category !== 'uncategorized') {
        const { db } = await import('../utils/db');
        await db.repos.update(repo.id, {
          category: suggestion.category,
          subCategory: suggestion.subCategory || '',
        });
        // Reload the page to reflect new category
        window.location.reload();
      } else {
        setAiError('AI returned uncategorized — try a different repo');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI analysis failed');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const applyAiTags = () => {
    if (aiSuggestion && aiSuggestion.length > 0) {
      onAiSuggest?.(repo.id, aiSuggestion);
      setAiSuggestion(null);
    }
  };

  const existingTagSet = new Set(repo.tags);
  const newAiTags = aiSuggestion?.filter((t) => !existingTagSet.has(t)) ?? [];

  // v1.2: Reclassify with confidence
  const handleReclassify = async () => {
    setReclassifying(true);
    try {
      await reclassifyRepo(repo.id);
      // Force re-render via parent callback by calling onAddTags with empty array
      // (the parent will reload data)
    } catch (err) {
      console.error('Reclassification failed:', err);
    } finally {
      setReclassifying(false);
    }
  };

  const confidence = repo.classificationConfidence ?? 0;

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

          {/* v1.2: Category badge with confidence */}
          {repo.category && repo.category !== 'uncategorized' ? (
            (() => {
              const catInfo = getCategoryInfo(repo.category);
              const subLabel = repo.subCategory ? getSubCategoryLabel(repo.category, repo.subCategory) : null;
              return (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <TagBadge
                    tag={repo.category}
                    category={repo.category}
                    subCategory={repo.subCategory}
                    size="sm"
                  />
                  {subLabel && (
                    <span className="text-[11px] text-gray-400">→ {subLabel}</span>
                  )}
                  {/* Confidence indicator */}
                  <span className={`text-[10px] font-medium ${getConfidenceColor(confidence)}`}>
                    {getConfidenceLabel(confidence)} ({confidence}%)
                  </span>
                  {/* Reclassify button */}
                  <button
                    onClick={handleReclassify}
                    disabled={reclassifying}
                    className="text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    title="Reclassify this repo"
                  >
                    <HiArrowPath className={`w-3 h-3 ${reclassifying ? 'animate-spin' : ''}`} />
                    Reclassify
                  </button>
                </div>
              );
            })()
          ) : repo.category === 'uncategorized' ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <TagBadge tag="uncategorized" category="uncategorized" size="sm" />
              <button
                onClick={handleReclassify}
                disabled={reclassifying}
                className="text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                title="Reclassify this repo"
              >
                <HiArrowPath className={`w-3 h-3 ${reclassifying ? 'animate-spin' : ''}`} />
                Reclassify
              </button>
            </div>
          ) : null}

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
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
            {/* v1.5: AI button now classifies repo (no tag suggestions) */}
            <button
              onClick={handleAiClassify}
              disabled={aiAnalyzing}
              className="text-xs text-purple-500 hover:text-purple-700 transition-colors px-1.5 py-0.5 rounded hover:bg-purple-50 flex items-center gap-1"
              title="AI classify repo"
            >
              {aiAnalyzing ? (
                <HiArrowPath className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <HiSparkles className="w-3.5 h-3.5" />
              )}
              {aiAnalyzing ? '...' : 'AI'}
            </button>
          </div>

          {/* Tag input */}
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

          {/* Legacy AI suggestion display (from earlier cache) */}
          {aiSuggestion && newAiTags.length > 0 && !aiAnalyzing && (
            <div className="mt-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-purple-700">🤖 Previously suggested tags:</span>
                <button
                  onClick={applyAiTags}
                  className="text-xs px-2 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                >
                  Apply {newAiTags.length} tag{newAiTags.length > 1 ? 's' : ''}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {newAiTags.map((tag) => {
                  const hash = tag.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
                  const colors = [
                    'bg-purple-100 text-purple-800',
                    'bg-indigo-100 text-indigo-800',
                    'bg-fuchsia-100 text-fuchsia-800',
                    'bg-violet-100 text-violet-800',
                  ];
                  const color = colors[Math.abs(hash) % colors.length];
                  return (
                    <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${color}`}>
                      {tag}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI error */}
          {aiError && !aiAnalyzing && (
            <div className="mt-1 text-xs text-red-500">{aiError}</div>
          )}
        </div>
      </div>
    </div>
  );
}
