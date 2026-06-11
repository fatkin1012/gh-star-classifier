import { useState, useEffect } from 'react';
import { HiPlus, HiTrash, HiPencil, HiXMark, HiSparkles } from 'react-icons/hi2';
import { db, getSettings, updateSettings, getCategoryStats, getDynamicCategories, getDynamicCategoryStats, deleteDynamicCategory, renameDynamicCategory } from '../../utils/db';
import { checkTokenScopes } from '../../utils/github';
import { classifyRepoWithLLM, fetchReadmeSummary } from '../../utils/llm';
import { classifyRepoSync } from '../../utils/classify';
import { CATEGORIES } from '../../utils/classify';
import type { AutoTagRule } from '../../utils/types';

export default function OptionsApp() {
  const [rules, setRules] = useState<AutoTagRule[]>([]);
  const [token, setToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);

  // New rule form
  const [newName, setNewName] = useState('');
  const [newMatchType, setNewMatchType] = useState<AutoTagRule['matchType']>('language');
  const [newMatchValue, setNewMatchValue] = useState('');
  const [newTags, setNewTags] = useState('');

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [syncToGitHubLists, setSyncToGitHubLists] = useState(true);
  const [tokenHasUserScope, setTokenHasUserScope] = useState(true);
  const [scopeChecked, setScopeChecked] = useState(false);
  const [dynamicCats, setDynamicCats] = useState<Array<{ key: string; label: string; icon: string; count: number }>>([]);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [lowConfidenceCount, setLowConfidenceCount] = useState(0);
  const [totalRepoCount, setTotalRepoCount] = useState(0);


  useEffect(() => {
    loadRules();
    getSettings().then(async (s) => {
      setToken(s.githubToken ?? '');
      setSyncToGitHubLists(s.syncToGitHubLists ?? true);

      // Check token scopes to warn about missing 'user' scope for GitHub Lists
      if (s.githubToken) {
        const scopeResult = await checkTokenScopes(s.githubToken);
        setTokenHasUserScope(scopeResult.hasUserScope);
        setScopeChecked(true);
        // Sync the cached scope result to settings so sync.ts can use it
        await updateSettings({ tokenHasUserScope: scopeResult.hasUserScope });
      } else {
        setScopeChecked(true);
      }
    });
    getCategoryStats().then((s) => {
      setCategoryCounts(s.categoryCounts);
      setUncategorizedCount(s.uncategorized);
    });
    getDynamicCategoryStats().then(setDynamicCats);
    // v1.2: Count low-confidence repos
    db.repos.toArray().then((all) => {
      setTotalRepoCount(all.length);
      const low = all.filter((r) => {
        const conf = r.classificationConfidence;
        return conf !== undefined && conf > 0 && conf < 40;
      }).length;
      setLowConfidenceCount(low);
    });

  }, []);

  async function loadRules() {
    const all = await db.rules.toArray();
    setRules(all);
  }

  async function handleAddRule() {
    if (!newName.trim() || !newMatchValue.trim() || !newTags.trim()) return;
    const tags = newTags.split(/[,;，；\s]+/).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;

    await db.rules.add({
      name: newName.trim(),
      matchType: newMatchType,
      matchValue: newMatchValue.trim().toLowerCase(),
      tags,
    });

    setNewName('');
    setNewMatchValue('');
    setNewTags('');
    await loadRules();
  }

  async function handleDeleteRule(id: number | undefined) {
    if (!id) return;
    await db.rules.delete(id);
    await loadRules();
  }

  async function handleSaveToken() {
    if (!token.trim()) return;
    await updateSettings({ githubToken: token.trim() });
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);

    // Re-check scopes with the new token
    const scopeResult = await checkTokenScopes(token.trim());
    setTokenHasUserScope(scopeResult.hasUserScope);
    await updateSettings({ tokenHasUserScope: scopeResult.hasUserScope });
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">⚙️ Star Classifier Options</h1>

      {/* Token */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-700">GitHub Token</h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSaveToken}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {tokenSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-500">Token with <code>repo</code> and <code>read:user</code> scopes</p>
      </section>

      {/* v1.1: Classification Overview + v1.2: GitHub Lists Sync */}
      <section className="space-y-3">
        {/* ⚠️ Scope warning banner */}
        {scopeChecked && !tokenHasUserScope && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800" role="alert">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-medium">GitHub Lists Sync: Your token needs the 'user' scope.</p>
                <p className="mt-1 text-yellow-700">
                  Update at:{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-yellow-900"
                  >
                    https://github.com/settings/tokens
                  </a>
                </p>
                <p className="mt-1 text-xs text-yellow-600">
                  The toggle below is disabled until the token includes the <code>user</code> scope.
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">📂 Auto-Classification (v1.1)</h2>
          <label className={`flex items-center gap-2 ${!tokenHasUserScope ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <span className="text-xs text-gray-500">Sync to GitHub Lists</span>
            <button
              role="switch"
              aria-checked={syncToGitHubLists && tokenHasUserScope}
              disabled={!tokenHasUserScope}
              onClick={async () => {
                if (!tokenHasUserScope) return;
                const next = !syncToGitHubLists;
                setSyncToGitHubLists(next);
                await updateSettings({ syncToGitHubLists: next });
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                syncToGitHubLists && tokenHasUserScope ? 'bg-blue-600' : 'bg-gray-300'
              } ${!tokenHasUserScope ? 'cursor-not-allowed' : ''}`}
              title={!tokenHasUserScope ? 'Add the user scope to your token to enable this feature' : ''}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  syncToGitHubLists && tokenHasUserScope ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Repos are auto-classified into 5 standard categories during every sync.
          {syncToGitHubLists && tokenHasUserScope && ' Classified repos are also added to the corresponding GitHub star list.'}
          {!tokenHasUserScope && scopeChecked && ' GitHub Lists sync is unavailable — add the "user" scope to your token above.'}
        </p>
      {/* v1.1: Classification Overview */}
      {Object.keys(categoryCounts).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-700">📂 Auto-Classification (v1.2)</h2>
          <p className="text-xs text-gray-500">
            Repos are auto-classified into 5 standard categories during every sync. Confidence shown where available.
          </p>

          {/* Quality summary */}
          <div className="flex gap-2 text-xs">
            <span className="text-green-600">✓ {totalRepoCount - uncategorizedCount - lowConfidenceCount} well-classified</span>
            {lowConfidenceCount > 0 && <span className="text-yellow-600">⚠ {lowConfidenceCount} low confidence</span>}
            {uncategorizedCount > 0 && <span className="text-red-500">✗ {uncategorizedCount} uncategorized</span>}
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat.key] || 0;
              return (
                <div key={cat.key} className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{cat.icon}</span>
                    <span className="text-sm font-medium text-gray-700">{cat.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{count} repos</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cat.subCategories.map((sub) => (
                      <span key={sub.key} className="text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded-full border border-gray-200">
                        {sub.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {uncategorizedCount > 0 && (
              <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm font-medium text-gray-500">❓ Uncategorized</div>
                <div className="text-xs text-gray-400 mt-0.5">{uncategorizedCount} repos</div>
              </div>
            )}
          </div>
        </section>

      {/* v1.3: Dynamic Categories */}
      {dynamicCats.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">📂 Dynamic Categories (v1.3)</h2>
          <p className="text-xs text-gray-500">
            Auto-generated categories for repos that don't fit the 5 standard categories.
            Created when multiple uncategorized repos share common topics or languages.
          </p>
          <div className="space-y-2">
            {dynamicCats.map((dc) => (
              <div key={dc.key} className="flex items-center gap-3 px-4 py-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <span className="text-lg">{dc.icon}</span>
                <div className="flex-1 min-w-0">
                  {renamingKey === dc.key ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          if (renameValue.trim()) {
                            await renameDynamicCategory(dc.key, renameValue.trim());
                            const stats = await getDynamicCategoryStats();
                            setDynamicCats(stats);
                          }
                          setRenamingKey(null);
                        }}
                        className="px-2 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setRenamingKey(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <HiXMark className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-800">{dc.label}</span>
                      <button
                        onClick={() => {
                          setRenamingKey(dc.key);
                          setRenameValue(dc.label);
                        }}
                        className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
                        title="Rename"
                      >
                        <HiPencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    <code className="text-[10px] bg-indigo-100 px-1 rounded">{dc.key}</code>
                    {' · '}{dc.count} repos
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (confirm(`Delete "${dc.label}" and unassign its ${dc.count} repos?`)) {
                      await deleteDynamicCategory(dc.key);
                      const stats = await getDynamicCategoryStats();
                      setDynamicCats(stats);
                      // Refresh main category stats too
                      const cs = await getCategoryStats();
                      setCategoryCounts(cs.categoryCounts);
                      setUncategorizedCount(cs.uncategorized);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="Delete category"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* v1.5: Re-AI classify all stars button */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
          <HiSparkles className="w-5 h-5 text-purple-500" />
          AI Re-Classification
        </h2>
        <p className="text-xs text-gray-500">
          Re-classify all repos using the configured LLM. This will update category and subCategory
          for every repo in your database. Progress is shown below.
        </p>
        <RecategorizeButton />
      </section>

      {/* Auto-classify Rules */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-700">Auto-Classify Rules</h2>

        {/* Existing rules */}
        {rules.length === 0 && (
          <p className="text-sm text-gray-400">No rules yet. Add one below.</p>
        )}
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-800">{rule.name}</span>
                  <span className="text-xs bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">{rule.matchType}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {rule.matchType === 'language' && `Language: ${rule.matchValue}`}
                  {rule.matchType === 'topic' && `Topic: ${rule.matchValue}`}
                  {(rule.matchType === 'name_contains' || rule.matchType === 'description_contains') && `Contains: ${rule.matchValue}`}
                  {' → '}
                  {rule.tags.join(', ')}
                </p>
              </div>
              <button
                onClick={() => handleDeleteRule(rule.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Delete rule"
              >
                <HiTrash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add rule form */}
        <div className="p-4 border border-dashed border-gray-300 rounded-lg space-y-3">
          <h3 className="text-sm font-medium text-gray-600">New Rule</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rule name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. ML projects"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Match type</label>
              <select
                value={newMatchType}
                onChange={(e) => setNewMatchType(e.target.value as AutoTagRule['matchType'])}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="language">Language</option>
                <option value="topic">Topic</option>
                <option value="name_contains">Repo name contains</option>
                <option value="description_contains">Description contains</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Match value</label>
              <input
                type="text"
                value={newMatchValue}
                onChange={(e) => setNewMatchValue(e.target.value)}
                placeholder={newMatchType === 'language' ? 'e.g. Python' : 'e.g. machine-learning'}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Apply tags</label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g. ml, ai"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={handleAddRule}
            disabled={!newName.trim() || !newMatchValue.trim() || !newTags.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <HiPlus className="w-4 h-4" />
            Add Rule
          </button>
        </div>
      </section>

      {/* Footer */}
      <p className="text-xs text-gray-400 text-center pt-4 border-t border-gray-100">
        GitHub Star Classifier v1.5.0
      </p>
    </div>
  );
}

// ─── v1.5: Re-categorize all repos button ────────────────────────

function RecategorizeButton() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleRecategorize = async () => {
    const settings = await getSettings();
    if (!settings.llm.apiKey) {
      setResult('⚠️ Please configure an AI provider API key in the popup settings first.');
      return;
    }

    setRunning(true);
    setProgress(null);
    setResult(null);

    const allRepos = await db.repos.toArray();
    const total = allRepos.length;
    let success = 0;
    let failed = 0;

    setProgress({ done: 0, total });

    for (let i = 0; i < total; i++) {
      const repo = allRepos[i];
      setProgress({ done: i + 1, total });

      try {
        const readmeSummary = await fetchReadmeSummary(repo);
        const suggestion = await classifyRepoWithLLM(repo, readmeSummary, settings.llm);

        if (suggestion.category && suggestion.category !== 'uncategorized') {
          await db.repos.update(repo.id, {
            category: suggestion.category,
            subCategory: suggestion.subCategory || '',
          });
          success++;
        } else {
          // LLM returned uncategorized — use rule-based as fallback
          const fallback = classifyRepoSync({
            name: repo.name,
            fullName: repo.fullName,
            description: repo.description || '',
            language: repo.language || '',
            topics: repo.topics,
          });
          await db.repos.update(repo.id, {
            category: fallback.category,
            subCategory: fallback.subCategory || '',
          });
          success++;
        }
      } catch (err) {
        console.error(`[ReCategorize] Failed on ${repo.fullName}:`, err);
        // Fallback to rule-based on error
        try {
          const fallback = classifyRepoSync({
            name: repo.name,
            fullName: repo.fullName,
            description: repo.description || '',
            language: repo.language || '',
            topics: repo.topics,
          });
          await db.repos.update(repo.id, {
            category: fallback.category,
            subCategory: fallback.subCategory || '',
          });
          success++;
        } catch {
          failed++;
        }
      }

      // Small delay to avoid rate limits
      if (i < total - 1) await new Promise((r) => setTimeout(r, 500));
    }

    setRunning(false);
    setResult(`✓ Done! Success: ${success}, Failed: ${failed}`);
    setTimeout(() => setResult(null), 10000);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleRecategorize}
        disabled={running}
        className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium w-full"
      >
        <HiSparkles className={`w-5 h-5 ${running ? 'animate-pulse' : ''}`} />
        {running ? 'Re-classifying...' : '🤖 Re-AI Classify All Stars'}
      </button>

      {/* Progress bar */}
      {progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Processing repos...</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-purple-600 h-2.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {result && (
        <div className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700">
          {result}
        </div>
      )}
    </div>
  );
}
