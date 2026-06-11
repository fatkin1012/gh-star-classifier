import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  HiStar, HiCog6Tooth, HiSparkles, HiMagnifyingGlass,
  HiFunnel, HiArrowPath, HiCheckCircle, HiTag, HiBars3,
  HiListBullet,
} from 'react-icons/hi2';
import { db, getSettings, updateSettings, getAiCache, setAiCache, getCategoryStats } from '../../utils/db';
import { getAllTags, addTagsToRepo, removeTagsFromRepo, bulkTagRepos } from '../../utils/tags';
import { fullSync, syncToGitHubStarLists } from '../../utils/sync';
import { classifyRepoWithLLM, fetchReadmeSummary, validateLlmConfig, getProviderDefaults } from '../../utils/llm';
import { getCategoryInfo, getSubCategoryLabel, CATEGORIES } from '../../utils/classify';
import type { TaggedRepo, LlmProvider } from '../../utils/types';
import TagBadge from '../../components/TagBadge';

type PanelTab = 'repos' | 'ai' | 'settings';

export default function SidePanelApp() {
  const [tab, setTab] = useState<PanelTab>('repos');

  // v1.5: useLiveQuery for real-time DB reactivity
  const repos = useLiveQuery(() => db.repos.toArray()) ?? [];
  const allTags = useLiveQuery(async () => (await getAllTags())) ?? [];
  const categoryStats = useLiveQuery(async () => (await getCategoryStats())) ?? { categoryCounts: {} as Record<string, number>, uncategorized: 0 };
  const categoryCounts = categoryStats.categoryCounts;
  const uncategorizedCount = categoryStats.uncategorized;
  const loading = false; // v1.5: useLiveQuery is synchronous-first, no manual loading state needed

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSubCategory, setFilterSubCategory] = useState<string | null>(null);

  // AI
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  // Settings
  const [githubToken, setGithubToken] = useState('');
  const [syncInterval, setSyncInterval] = useState(30);
  const [autoClassify, setAutoClassify] = useState(true);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmAutoNew, setLlmAutoNew] = useState(false);
  const [llmBatchSize, setLlmBatchSize] = useState(5);
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [llmValidating, setLlmValidating] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);

  // ─── v1.5: Data loading via useLiveQuery ────────────

  // loadData no longer needed — useLiveQuery handles real-time repo/tag data
  const loadData = useCallback(async () => {}, []);

  const loadSettings = useCallback(async () => {
    const s = await getSettings();
    setGithubToken(s.githubToken ?? '');
    setSyncInterval(s.syncIntervalMinutes);
    setAutoClassify(s.autoClassifyEnabled);
    setLlmProvider(s.llm.provider);
    setLlmApiKey(s.llm.apiKey);
    setLlmModel(s.llm.model);
    setLlmBaseUrl(s.llm.baseUrl);
    setLlmBatchSize(s.llm.batchSize);
    setLlmAutoNew(s.llm.autoClassifyNew);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const untaggedCount = repos.filter((r) => r.tags.length === 0).length;

  // ─── Filtering ───────────────────────────────────────

  const filteredRepos = useMemo(() => {
    let result = repos;

    if (filterCategory) {
      if (filterCategory === 'uncategorized') {
        result = result.filter((r) => r.category === 'uncategorized' || !r.category);
      } else if (filterSubCategory) {
        result = result.filter((r) => r.category === filterCategory && r.subCategory === filterSubCategory);
      } else {
        result = result.filter((r) => r.category === filterCategory);
      }
    }

    if (showUntaggedOnly) result = result.filter((r) => r.tags.length === 0);
    if (selectedTag) result = result.filter((r) => r.tags.includes(selectedTag!));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.language ?? '').toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          (r.category ?? '').toLowerCase().includes(q) ||
          (r.subCategory ?? '').toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => b.stars - a.stars);
  }, [repos, selectedTag, searchQuery, showUntaggedOnly, filterCategory, filterSubCategory]);

  // ─── Tag actions ─────────────────────────────────────

  const handleAddTags = async (repoId: number, tags: string[]) => {
    await addTagsToRepo(repoId, tags);
    await loadData();
  };

  const handleRemoveTag = async (repoId: number, tag: string) => {
    await removeTagsFromRepo(repoId, [tag]);
    await loadData();
  };

  // ─── Sync to Lists (Task 3) ───────────────────────────
  const [syncingLists, setSyncingLists] = useState(false);
  const [syncListsStatus, setSyncListsStatus] = useState<string | null>(null);

  const handleSyncToLists = async () => {
    if (isSyncing) return;
    const s = await getSettings();
    if (!s.githubToken) {
      setSyncListsStatus('GitHub token not configured');
      return;
    }
    setIsSyncing(true);
    setSyncingLists(true);
    setSyncListsStatus('Syncing to GitHub star lists...');
    try {
      const result = await syncToGitHubStarLists(s.githubToken);
      setSyncListsStatus(`✓ Synced ${result.synced}/${result.total} repos to GitHub lists`);
    } catch (err) {
      setSyncListsStatus(`✗ ${err instanceof Error ? err.message : 'Sync failed'}`);
    } finally {
      setSyncingLists(false);
      setIsSyncing(false);
      setTimeout(() => setSyncListsStatus(null), 5000);
    }
  };

  // ─── Sync (with concurrency guard) ────────────────────
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (isSyncing) return;
    const s = await getSettings();
    if (!s.githubToken) return;
    setIsSyncing(true);
    try {
      await fullSync(s.githubToken);
      await loadData();
    } finally {
      setIsSyncing(false);
    }
  };

  // ─── AI ──────────────────────────────────────────────

  /** v1.5: AI batch now classifies repos (category + subCategory), no tag suggestions */
  const handleAiBatch = async () => {
    const s = await getSettings();
    if (!s.llm.apiKey) {
      setAiStatus('Configure AI provider in Settings first');
      return;
    }
    setAiAnalyzing(true);
    setAiStatus('Starting AI classification...');
    const unclassified = repos.filter((r) => !r.category || r.category === 'uncategorized' || r.category === '').slice(0, s.llm.batchSize);

    let classified = 0;
    for (let i = 0; i < unclassified.length; i++) {
      const repo = unclassified[i];
      setAiStatus(`Classifying ${i + 1}/${unclassified.length}: ${repo.fullName}`);
      try {
        const readmeSummary = await fetchReadmeSummary(repo);
        const suggestion = await classifyRepoWithLLM(repo, readmeSummary, s.llm);
        await setAiCache(repo.id, { ...suggestion, analyzedAt: Date.now() });

        if (suggestion.category && suggestion.category !== 'uncategorized') {
          const { db } = await import('../../utils/db');
          await db.repos.update(repo.id, {
            category: suggestion.category,
            subCategory: suggestion.subCategory || '',
          });
          classified++;
        }
      } catch (err) {
        console.error(`[AI] Failed on ${repo.fullName}:`, err);
      }
      if (i < unclassified.length - 1) await new Promise((r) => setTimeout(r, 800));
    }
    await loadData();
    setAiStatus(`✓ Classified ${classified}/${unclassified.length} repos`);
    setAiAnalyzing(false);
    setTimeout(() => setAiStatus(null), 5000);
  };

  // ─── Settings ────────────────────────────────────────

  const handleLlmProviderChange = (provider: LlmProvider) => {
    const defaults = getProviderDefaults(provider);
    setLlmProvider(provider);
    if (!llmModel || llmModel === getProviderDefaults(llmProvider).model) {
      setLlmModel(defaults.model);
    }
    if (!llmBaseUrl || llmBaseUrl === getProviderDefaults(llmProvider).baseUrl) {
      setLlmBaseUrl(defaults.baseUrl);
    }
    setLlmStatus(null);
  };

  const handleValidateLlm = async () => {
    setLlmValidating(true);
    setLlmStatus(null);
    try {
      const result = await validateLlmConfig({
        provider: llmProvider, apiKey: llmApiKey, model: llmModel,
        baseUrl: llmBaseUrl, customPrompt: '', batchSize: llmBatchSize, autoClassifyNew: llmAutoNew,
      });
      setLlmStatus(result);
    } catch (err) {
      setLlmStatus({ ok: false, message: (err as Error).message });
    } finally {
      setLlmValidating(false);
    }
  };

  const handleSaveSettings = async () => {
    const existingSettings = await getSettings();
    await updateSettings({
      githubToken: githubToken || null,
      autoClassifyEnabled: autoClassify,
      syncIntervalMinutes: syncInterval,
      llm: {
        provider: llmProvider, apiKey: llmApiKey, model: llmModel,
        baseUrl: llmBaseUrl, customPrompt: existingSettings.llm.customPrompt, batchSize: llmBatchSize, autoClassifyNew: llmAutoNew,
      },
    });
    await browser.alarms.create('sync-stars', { periodInMinutes: syncInterval });
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  // ─── Render ──────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-white text-gray-800">
      {/* Top nav */}
      <header className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <HiStar className="w-5 h-5 text-yellow-500" />
        <span className="font-bold text-sm flex-1">Star Classifier</span>
        <span className="text-xs text-gray-400">{repos.length} repos</span>
      </header>

      {/* Tab bar */}
      <nav className="flex border-b border-gray-200 bg-gray-50 px-2">
        {([
          { id: 'repos' as PanelTab, label: 'Repos', icon: HiTag },
          { id: 'ai' as PanelTab, label: 'AI', icon: HiSparkles },
          { id: 'settings' as PanelTab, label: 'Settings', icon: HiCog6Tooth },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ─── REPOS TAB ──────────────────────────────── */}
        {tab === 'repos' && (
          <div className="p-3 space-y-3">
            {/* Search + filters */}
            <div className="relative">
              <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search repos..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Category + tag filter chips */}
            <div className="flex flex-wrap items-center gap-1">
              <HiFunnel className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <button onClick={() => { setSelectedTag(null); setShowUntaggedOnly(false); setFilterCategory(null); setFilterSubCategory(null); }}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  !selectedTag && !showUntaggedOnly && !filterCategory
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}>All</button>
              {CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.key] || 0;
                if (count === 0) return null;
                return (
                  <button key={cat.key} onClick={() => setFilterCategory(filterCategory === cat.key ? null : cat.key)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      filterCategory === cat.key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}>
                    {cat.icon} {count}
                  </button>
                );
              })}
              <button onClick={() => setShowUntaggedOnly(!showUntaggedOnly)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  showUntaggedOnly
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                }`}>
                Untagged ({untaggedCount})
              </button>
            </div>

            {/* Sync bar */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">
              <HiCheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="flex-1">{repos.length} repos · {untaggedCount} untagged</span>
              <button onClick={handleSyncToLists} disabled={syncingLists}
                className="flex items-center gap-1 text-green-600 hover:bg-green-50 px-2 py-1 rounded transition-colors disabled:opacity-50">
                <HiListBullet className="w-3.5 h-3.5" /> {syncingLists ? '...' : 'Lists'}
              </button>
              <button onClick={handleSync} className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                <HiArrowPath className="w-3.5 h-3.5" /> Sync
              </button>
            </div>
            {syncListsStatus && (
              <div className={`text-xs px-3 py-1.5 rounded-lg ${
                syncListsStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {syncListsStatus}
              </div>
            )}

            {/* Repo list */}
            {filteredRepos.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No repos found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRepos.map((repo) => (
                  <RepoRow
                    key={repo.id}
                    repo={repo}
                    aiSuggestion={null}
                    onAddTags={handleAddTags}
                    onRemoveTag={handleRemoveTag}
                    onApplyAi={(_id, _tags) => {}}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── AI TAB ─────────────────────────────────── */}
        {tab === 'ai' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <HiSparkles className="w-5 h-5 text-purple-500" />
              <h2 className="text-sm font-semibold">AI Classification</h2>
            </div>
            <p className="text-xs text-gray-500">
              Analyze untagged repos with an LLM to automatically suggest tags.
            </p>

            <button onClick={handleAiBatch} disabled={aiAnalyzing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium">
              <HiSparkles className="w-5 h-5" />
              {aiAnalyzing ? 'Classifying...' : `AI Classify Uncategorized Repos`}
            </button>

            {aiStatus && (
              <div className={`text-xs px-3 py-2 rounded-lg ${
                aiStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
              }`}>{aiStatus}</div>
            )}
          </div>
        )}

        {/* ─── SETTINGS TAB ───────────────────────────── */}
        {tab === 'settings' && (
          <div className="p-4 space-y-4">
            <h2 className="text-sm font-semibold">GitHub</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Personal Access Token</label>
              <input type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <h2 className="text-sm font-semibold mt-4">Sync</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Auto-classify (rules)</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={autoClassify} onChange={(e) => setAutoClassify(e.target.checked)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
              <select value={syncInterval} onChange={(e) => setSyncInterval(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value={15}>Every 15 min</option>
                <option value={30}>Every 30 min</option>
                <option value={60}>Every hour</option>
                <option value={180}>Every 3 hours</option>
              </select>
            </div>

            <h2 className="text-sm font-semibold mt-4 flex items-center gap-1.5">
              <HiSparkles className="w-4 h-4 text-purple-500" /> AI Classifier
            </h2>
            <div className="space-y-3">
              <select value={llmProvider} onChange={(e) => handleLlmProviderChange(e.target.value as LlmProvider)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="deepseek">DeepSeek</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
              {llmProvider !== 'ollama' && (
                <input type="password" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder="API key..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
              )}
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={llmModel} onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="Model" className="px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                <input type="text" value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="Base URL" className="px-3 py-2 text-sm border border-gray-300 rounded-lg" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Auto-analyze new stars</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={llmAutoNew} onChange={(e) => setLlmAutoNew(e.target.checked)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-purple-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={handleValidateLlm} disabled={llmValidating}
                  className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {llmValidating ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
              {llmStatus && (
                <div className={`text-xs px-3 py-2 rounded-lg ${llmStatus.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {llmStatus.ok ? '✓ ' : '✗ '}{llmStatus.message}
                </div>
              )}
            </div>

            <button onClick={handleSaveSettings}
              className="w-full px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              {tokenSaved ? '✓ Saved!' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RepoRow component (compact side-panel card) ─────────

function RepoRow({
  repo, aiSuggestion, onAddTags, onRemoveTag, onApplyAi,
}: {
  repo: TaggedRepo;
  aiSuggestion: string[] | null;
  onAddTags: (id: number, tags: string[]) => void;
  onRemoveTag: (id: number, tag: string) => void;
  onApplyAi: (id: number, tags: string[]) => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const handleAdd = () => {
    const tags = tagInput.split(/[,;，；\s]+/).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;
    onAddTags(repo.id, tags);
    setTagInput('');
    setShowInput(false);
  };

  const catInfo = repo.category && repo.category !== 'uncategorized'
    ? getCategoryInfo(repo.category)
    : null;
  const subLabel = repo.subCategory && catInfo
    ? getSubCategoryLabel(repo.category, repo.subCategory)
    : null;

  return (
    <div className="p-2.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-start gap-2.5">
        <img src={repo.ownerAvatar} alt={repo.owner} className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer"
            className="font-medium text-sm text-blue-700 hover:underline truncate block">
            {repo.fullName}
          </a>
          {repo.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{repo.description}</p>
          )}

          {/* v1.1: Category badge */}
          {catInfo && (
            <div className="flex items-center gap-1 mt-1">
              <TagBadge
                tag={repo.category}
                category={repo.category}
                subCategory={repo.subCategory}
                size="sm"
              />
              {subLabel && (
                <span className="text-[10px] text-gray-400">→ {subLabel}</span>
              )}
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {repo.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} onRemove={(t) => onRemoveTag(repo.id, t)} size="sm" />
            ))}
            <button onClick={() => setShowInput(!showInput)}
              className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-0.5 rounded hover:bg-gray-100">
              + tag
            </button>
          </div>

          {/* AI suggestion */}
          {aiSuggestion && aiSuggestion.length > 0 && !repo.tags.some((t) => aiSuggestion.includes(t)) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-xs text-purple-500">🤖</span>
              {aiSuggestion.map((t) => (
                <span key={t} className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{t}</span>
              ))}
              <button onClick={() => onApplyAi(repo.id, aiSuggestion)}
                className="text-xs px-1.5 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors">
                Apply
              </button>
            </div>
          )}

          {/* Quick-add input */}
          {showInput && (
            <div className="mt-1.5 flex gap-1">
              <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Add tag..."
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button onClick={handleAdd} disabled={!tagInput.trim()}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Add</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
