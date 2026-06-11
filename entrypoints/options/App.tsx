import { useState, useEffect } from 'react';
import { HiPlus, HiTrash } from 'react-icons/hi2';
import { db, getSettings, updateSettings, getCategoryStats } from '../../utils/db';
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
  const [lowConfidenceCount, setLowConfidenceCount] = useState(0);
  const [totalRepoCount, setTotalRepoCount] = useState(0);

  useEffect(() => {
    loadRules();
    getSettings().then((s) => setToken(s.githubToken ?? ''));
    getCategoryStats().then((s) => {
      setCategoryCounts(s.categoryCounts);
      setUncategorizedCount(s.uncategorized);
    });
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
      )}

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
        GitHub Star Classifier v1.1.0
      </p>
    </div>
  );
}
