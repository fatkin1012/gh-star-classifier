import { useState } from 'react';
import { HiSparkles, HiArrowPath } from 'react-icons/hi2';
import { getSettings, getAiCache, setAiCache, getUnanalyzedRepos } from '../utils/db';
import { analyzeRepo, fetchReadmeSummary, batchAnalyze } from '../utils/llm';
import type { TaggedRepo, AiSuggestion } from '../utils/types';

interface AiAnalyzerProps {
  repos: TaggedRepo[];
  onApplySuggestion: (repoId: number, tags: string[]) => void;
  onDataChanged: () => void;
}

export default function AiAnalyzer({ repos, onApplySuggestion, onDataChanged }: AiAnalyzerProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const unanalyzedRepos = repos.filter((r) => r.tags.length === 0);

  if (unanalyzedRepos.length === 0) return null;

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

      const batch = unanalyzedRepos.slice(0, settings.llm.batchSize);
      let done = 0;

      for (const repo of batch) {
        setStatus(`Analyzing ${repo.fullName} (${++done}/${batch.length})...`);
        try {
          const readmeSummary = await fetchReadmeSummary(repo);
          const suggestion = await analyzeRepo(repo, readmeSummary, settings.llm);
          await setAiCache(repo.id, { ...suggestion, analyzedAt: Date.now() });
          if (suggestion.tags.length > 0) {
            onApplySuggestion(repo.id, suggestion.tags);
          }
        } catch (err) {
          console.error(`[AI] Failed on ${repo.fullName}:`, err);
        }
        // Small delay between repos to avoid rate limits
        if (done < batch.length) await new Promise((r) => setTimeout(r, 800));
      }

      setStatus(`✓ Analyzed ${done} repos. Check the suggestions!`);
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
        {status || `${unanalyzedRepos.length} repos without tags`}
      </span>
      <button
        onClick={handleBatchAi}
        disabled={analyzing}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        <HiArrowPath className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
        {analyzing ? 'Analyzing...' : 'AI Classify'}
      </button>
    </div>
  );
}
