import { useState, useEffect, useCallback, useMemo } from 'react';
import { HiCog6Tooth, HiSparkles } from 'react-icons/hi2';
import { db, getSettings, updateSettings, getAiCache, setAiCache, getUnanalyzedRepos } from '../../utils/db';
import { getAllTags, addTagsToRepo, removeTagsFromRepo, bulkTagRepos } from '../../utils/tags';
import { fullSync } from '../../utils/sync';
import { analyzeRepo, fetchReadmeSummary, validateLlmConfig, getProviderDefaults } from '../../utils/llm';
import type { TaggedRepo, LlmProvider, LlmSettings } from '../../utils/types';
import FilterBar from '../../components/FilterBar';
import SyncStatus from '../../components/SyncStatus';
import RepoList from '../../components/RepoList';
import ExportImport from '../../components/ExportImport';
import AiAnalyzer from '../../components/AiAnalyzer';

type Tab = 'repos' | 'settings';

export default function PopupApp() {
  const [tab, setTab] = useState<Tab>('repos');
  const [repos, setRepos] = useState<TaggedRepo[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Settings state
  const [githubToken, setGithubToken] = useState('');
  const [autoClassify, setAutoClassify] = useState(true);
  const [syncInterval, setSyncInterval] = useState(30);
  const [newStarDefaultTags, setNewStarDefaultTags] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);

  // LLM settings state
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmBatchSize, setLlmBatchSize] = useState(5);
  const [llmAutoNew, setLlmAutoNew] = useState(false);
  const [llmCustomPrompt, setLlmCustomPrompt] = useState('');
  const [llmValidating, setLlmValidating] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const loadData = useCallback(async () => {
    const allRepos = await db.repos.toArray();
    setRepos(allRepos);
    setAllTags(await getAllTags());
  }, []);

  const loadSettings = useCallback(async () => {
    const s = await getSettings();
    setGithubToken(s.githubToken ?? '');
    setAutoClassify(s.autoClassifyEnabled);
    setSyncInterval(s.syncIntervalMinutes);
    setNewStarDefaultTags(s.newStarDefaultTags?.join(', ') ?? '');
    // LLM settings
    setLlmProvider(s.llm.provider);
    setLlmApiKey(s.llm.apiKey);
    setLlmModel(s.llm.model);
    setLlmBaseUrl(s.llm.baseUrl);
    setLlmBatchSize(s.llm.batchSize);
    setLlmAutoNew(s.llm.autoClassifyNew);
    setLlmCustomPrompt(s.llm.customPrompt);
  }, []);

  useEffect(() => {
    loadData();
    loadSettings();
  }, [loadData, loadSettings]);

  const filteredRepos = useMemo(() => {
    let result = repos;
    if (selectedTag) {
      result = result.filter((r) => r.tags.includes(selectedTag!));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.language ?? '').toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => b.stars - a.stars);
  }, [repos, selectedTag, searchQuery]);

  const getLastSync = useCallback(async () => {
    const newest = await db.repos.orderBy('lastSyncedAt').last();
    return newest?.lastSyncedAt ?? null;
  }, []);

  const handleSync = async () => {
    const s = await getSettings();
    if (!s.githubToken) throw new Error('GitHub token not configured');
    const result = await fullSync(s.githubToken);
    setLastSyncedAt(Date.now());
    await loadData();
    if (result.new > 0) {
      void browser.action.setBadgeText({ text: String(result.new) });
      void browser.action.setBadgeBackgroundColor({ color: '#2563eb' });
    }
  };

  const handleAddTags = async (repoId: number, tags: string[]) => {
    await addTagsToRepo(repoId, tags);
    await loadData();
  };

  const handleRemoveTag = async (repoId: number, tag: string) => {
    await removeTagsFromRepo(repoId, [tag]);
    await loadData();
  };

  const handleBulkTag = async (repoIds: number[], tags: string[]) => {
    await bulkTagRepos(repoIds, tags);
    await loadData();
  };

  /** Apply AI suggestion tags to a repo */
  const handleApplyAiSuggestion = async (repoId: number, tags: string[]) => {
    await addTagsToRepo(repoId, tags);
    await loadData();
  };

  // ─── LLM settings ─────────────────────────────────────

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
        provider: llmProvider,
        apiKey: llmApiKey,
        model: llmModel,
        baseUrl: llmBaseUrl,
        customPrompt: llmCustomPrompt,
        batchSize: llmBatchSize,
        autoClassifyNew: llmAutoNew,
      });
      setLlmStatus(result);
    } catch (err) {
      setLlmStatus({ ok: false, message: (err as Error).message });
    } finally {
      setLlmValidating(false);
    }
  };

  const handleSaveSettings = async () => {
    const defaultTags = newStarDefaultTags
      .split(/[,;，；\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    await updateSettings({
      githubToken: githubToken || null,
      autoClassifyEnabled: autoClassify,
      syncIntervalMinutes: syncInterval,
      newStarDefaultTags: defaultTags,
      llm: {
        provider: llmProvider,
        apiKey: llmApiKey,
        model: llmModel,
        baseUrl: llmBaseUrl,
        batchSize: llmBatchSize,
        autoClassifyNew: llmAutoNew,
        customPrompt: llmCustomPrompt,
      },
    });
    await browser.alarms.create('sync-stars', { periodInMinutes: syncInterval });
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  useEffect(() => {
    getLastSync().then(setLastSyncedAt);
  }, [getLastSync]);

  return (
    <div className="w-[480px] h-[600px] flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h1 className="font-bold text-base text-gray-800">⭐ Star Classifier</h1>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('repos')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              tab === 'repos' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            Repos
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors flex items-center gap-1 ${
              tab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <HiCog6Tooth className="w-4 h-4" />
            Settings
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'repos' && (
          <div className="space-y-3">
            <SyncStatus
              lastSyncedAt={lastSyncedAt}
              totalCount={repos.length}
              onSync={handleSync}
            />
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedTag={selectedTag}
              allTags={allTags}
              onTagFilter={setSelectedTag}
            />
            <ExportImport onImportComplete={loadData} />
            <AiAnalyzer
              repos={repos}
              onApplySuggestion={handleApplyAiSuggestion}
              onDataChanged={loadData}
            />
            <RepoList
              repos={filteredRepos}
              allTags={allTags}
              onAddTags={handleAddTags}
              onRemoveTag={handleRemoveTag}
              onBulkTag={handleBulkTag}
              onAiSuggest={handleApplyAiSuggestion}
            />
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4">
            {/* ─── GitHub ─── */}
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">GitHub Setup</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Personal Access Token
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  <code>repo</code> + <code>read:user</code> scopes.{' '}
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline">Generate</a>
                </p>
              </div>
            </div>

            {/* ─── Sync ─── */}
            <div className="border-b border-gray-100 pb-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Sync Settings</h2>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-700">Auto-classify (rules)</span>
                  <p className="text-xs text-gray-500">Apply rule-based auto tags to new stars</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={autoClassify}
                    onChange={(e) => setAutoClassify(e.target.checked)}
                    className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sync Interval</label>
                <select value={syncInterval} onChange={(e) => setSyncInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                  <option value={15}>Every 15 min</option>
                  <option value={30}>Every 30 min</option>
                  <option value={60}>Every hour</option>
                  <option value={180}>Every 3 hours</option>
                  <option value={1440}>Once daily</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default tags for new stars</label>
                <input type="text" value={newStarDefaultTags}
                  onChange={(e) => setNewStarDefaultTags(e.target.value)}
                  placeholder="e.g. starred, learning"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
              </div>
            </div>

            {/* ─── LLM AI Classifier ─── */}
            <div className="border-b border-gray-100 pb-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <HiSparkles className="w-4 h-4 text-purple-500" />
                AI Classifier
              </h2>
              <p className="text-xs text-gray-500">Use an LLM to analyze READMEs and suggest tags</p>

              {/* Provider */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                <select value={llmProvider}
                  onChange={(e) => handleLlmProviderChange(e.target.value as LlmProvider)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              {/* API Key */}
              {llmProvider !== 'ollama' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                  <input type="password" value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder={llmProvider === 'openrouter' ? 'sk-or-v1-...' : 'sk-...'}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                </div>
              )}

              {/* Model + Endpoint */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                  <input type="text" value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={getProviderDefaults(llmProvider).model}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Base URL</label>
                  <input type="text" value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    placeholder={getProviderDefaults(llmProvider).baseUrl}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                </div>
              </div>

              {/* Batch size */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-700">Batch size</span>
                  <p className="text-xs text-gray-500">Repos per analysis batch</p>
                </div>
                <input type="number" min={1} max={50} value={llmBatchSize}
                  onChange={(e) => setLlmBatchSize(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center" />
              </div>

              {/* Auto-classify new */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-700">Auto-analyze new stars</span>
                  <p className="text-xs text-gray-500">Run AI on new stars during sync</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={llmAutoNew}
                    onChange={(e) => setLlmAutoNew(e.target.checked)}
                    className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-purple-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>

              {/* Custom prompt */}
              <details className="group">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Custom prompt (advanced)
                </summary>
                <textarea value={llmCustomPrompt}
                  onChange={(e) => setLlmCustomPrompt(e.target.value)}
                  rows={4}
                  placeholder="Leave empty for default taxonomy prompt"
                  className="mt-2 w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono" />
              </details>

              {/* Test connection */}
              <div className="flex gap-2">
                <button onClick={handleValidateLlm}
                  disabled={llmValidating}
                  className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {llmValidating ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
              {llmStatus && (
                <div className={`text-xs px-3 py-2 rounded-lg ${
                  llmStatus.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {llmStatus.ok ? '✓ ' : '✗ '}{llmStatus.message}
                </div>
              )}
            </div>

            {/* Save */}
            <button onClick={handleSaveSettings}
              className="w-full px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              {tokenSaved ? '✓ Saved!' : 'Save All Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
