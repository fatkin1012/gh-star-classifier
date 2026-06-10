import { useState } from 'react';
import { HiSparkles, HiArrowPath } from 'react-icons/hi2';
import { getSettings, getAiCache, setAiCache } from '../utils/db';
import { classifyRepoWithLLM, fetchReadmeSummary } from '../utils/llm';
import { classifyRepoSync } from '../utils/classify';
import type { TaggedRepo } from '../utils/types';

interface AiAnalyzerProps {
  repos: TaggedRepo[];
  onApplySuggestion: (repoId: number, tags: string[]) => void;
  onDataChanged: () => void;
}

export default function AiAnalyzer({ repos, onApplySuggestion, onDataChanged }: AiAnalyzerProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // v1.5: Show repos without AI-categorized (no need to check tags anymore)
  const uncategorizedRepos = repos.filter((r) => !r.category || r.category === 'uncategorized' || r.category === '');

  if (uncategorizedRepos.length === 0) return null;

  const handleBatchAi = async () => {
    setAnalyzing(true);
    setStatus('Preparing...');
    try {
      const settings = await getSettings();
      if (!settings.llm.apiKey) {
        setStatus('Please configure LLM API key in Settings first');
        setAnalyzing(false);
        return;
      }

      const batch = uncategorizedRepos.slice(0, settings.llm.batchSize);
      let done = 0;

      for (const repo of batch) {
        setStatus(`Classifying ${repo.fullName} (${++done}/${batch.length})...`);
        try {
          const readmeSummary = await fetchReadmeSummary(repo);
          const suggestion = await classifyRepoWithLLM(repo, readmeSummary, settings.llm);
          await setAiCache(repo.id, { ...suggestion, analyzedAt: Date.now() });

          // v1.5: Only update category/subCategory — never tags from AI
          const { db } = await import('../utils/db');
          if (suggestion.category && suggestion.category !== 'uncategorized') {
            await db.repos.update(repo.id, {
              category: suggestion.category,
              subCategory: suggestion.subCategory || '',
            });
          }
        } catch (err) {
          console.error(`[AI] Failed on ${repo.fullName}:`, err);
          // Fallback to rule-based classification
          const { db } = await import('../utils/db');
          const fallback = classifyRepoSync({
            name: repo.name,
            fullName: repo.fullName,
            description: repo.description || '',
            language: repo.language || '',
            topics: repo.topics,
          });
          if (fallback.category && fallback.category !== 'uncategorized') {
            await db.repos.update(repo.id, {
              category: fallback.category,
              subCategory: fallback.subCategory || '',
            });
          }
        }
        if (done < batch.length) await new Promise((r) => setTimeout(r, 800));
      }

      setStatus(`✓ Classified ${done} repos successfully`);
      onDataChanged();
    } catch (err) {
      setStatus('✗ Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setAnalyzing(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200">
      <HiSparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
      <span className="text-xs text-purple-700 flex-1">
        {status || `${uncategorizedRepos.length} repos uncategorized`}
      </span>
      <button
        onClick={handleBatchAi}
        disabled={analyzing}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        <HiArrowPath className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
        {analyzing ? 'Classifying...' : 'AI Classify'}
      </button>
    </div>
  );
}
