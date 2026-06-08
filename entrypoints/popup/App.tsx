import { useState, useEffect, useCallback, useMemo } from 'react';
import { HiCog6Tooth } from 'react-icons/hi2';
import { db, getSettings } from '../../utils/db';
import { updateSettings } from '../../utils/db';
import { getAllTags, addTagsToRepo, removeTagsFromRepo, bulkTagRepos } from '../../utils/tags';
import { fullSync } from '../../utils/sync';
import type { TaggedRepo } from '../../utils/types';
import FilterBar from '../../components/FilterBar';
import SyncStatus from '../../components/SyncStatus';
import RepoList from '../../components/RepoList';
import ExportImport from '../../components/ExportImport';

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
  }, []);

  useEffect(() => {
    loadData();
    loadSettings();
  }, [loadData, loadSettings]);

  // Filtered repos
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

  // Get last sync time
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
    // Show notification via badge
    if (result.new > 0) {
      void browser.action.setBadgeText({ text: String(result.new) });
      void browser.action.setBadgeBackgroundColor({ color: '#2563eb' });
    }
    return;
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
    });
    // Schedule alarm for periodic sync
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
            <RepoList
              repos={filteredRepos}
              allTags={allTags}
              onAddTags={handleAddTags}
              onRemoveTag={handleRemoveTag}
              onBulkTag={handleBulkTag}
            />
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                GitHub Personal Access Token
                <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Requires <code>repo</code> and <code>read:user</code> scopes.
                Generate one at{' '}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  GitHub Settings
                </a>
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">Auto-classify</span>
                <p className="text-xs text-gray-500">Auto-apply rules on new stars</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoClassify}
                  onChange={(e) => setAutoClassify(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sync Interval (minutes)
              </label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={15}>Every 15 min</option>
                <option value={30}>Every 30 min</option>
                <option value={60}>Every hour</option>
                <option value={180}>Every 3 hours</option>
                <option value={1440}>Once daily</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default tags for new stars
              </label>
              <input
                type="text"
                value={newStarDefaultTags}
                onChange={(e) => setNewStarDefaultTags(e.target.value)}
                placeholder="e.g. starred, learning"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated tags applied to all new stars</p>
            </div>

            <button
              onClick={handleSaveSettings}
              className="w-full px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {tokenSaved ? '✓ Saved!' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
