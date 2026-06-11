// ============================================================
// Dexie IndexedDB database
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { TaggedRepo, AutoTagRule, AppSettings, AiSuggestion, DynamicCategoryRecord, DynamicCategory } from './types';
import { DEFAULT_SETTINGS } from './types';
import { classifyRepoSync } from './classify';

/** Stored AI analysis result for a repo */
export interface AiCacheEntry {
  repoId: number;
  suggestion: AiSuggestion;
}

export class StarDB extends Dexie {
  repos!: Table<TaggedRepo, number>;
  rules!: Table<AutoTagRule, number>;
  settings!: Table<AppSettings, string>;
  aiCache!: Table<AiCacheEntry, number>;
  categoryListMap!: Table<{ categoryKey: string; listId: string; listName: string }, string>;

  constructor() {
    super('GitHubStarClassifier');
    
    // v1: initial schema
    this.version(1).stores({
      repos: 'id, name, fullName, language, starredAt',
      rules: '++id, name, matchType',
      settings: 'key',
    });

    // v2: add tags index, aiCache (current production)
    this.version(2).stores({
      repos: 'id, name, fullName, language, *tags, starredAt',
      rules: '++id, name, matchType',
      settings: 'key',
      aiCache: 'repoId',
    });

    // v3: add category / subCategory for 5-category classification
    this.version(3).stores({
      repos: 'id, name, fullName, language, *tags, starredAt, category, subCategory',
      rules: '++id, name, matchType',
      settings: 'key',
      aiCache: 'repoId',
    }).upgrade(async (tx) => {
      const repos = await tx.table('repos').toArray();
      for (const repo of repos) {
        if (!repo.category) {
          const result = classifyRepoSync({
            name: repo.name || '',
            fullName: repo.fullName || '',
            description: repo.description || '',
            language: repo.language || '',
            topics: repo.topics || [],
          });
          await tx.table('repos').update(repo.id, {
            category: result.category,
            subCategory: result.subCategory,
          });
        }
      }
    });

    // v4: add categoryListMap for syncing to GitHub star lists
    this.version(4).stores({
      repos: 'id, name, fullName, language, *tags, starredAt, category, subCategory',
      rules: '++id, name, matchType',
      settings: 'key',
      aiCache: 'repoId',
      categoryListMap: 'categoryKey',
    });

    // v5: add dynamicCategories table + dynamicCategory field on repos
    this.version(5).stores({
      repos: 'id, name, fullName, language, *tags, starredAt, category, subCategory, dynamicCategory',
      rules: '++id, name, matchType',
      settings: 'key',
      aiCache: 'repoId',
      categoryListMap: 'categoryKey',
      dynamicCategories: 'key, label, createdAt',
    });
  }

  dynamicCategories!: Table<DynamicCategoryRecord, string>;
}

let _dbInstance: StarDB | null = null;
let _dbError: Error | null = null;

function getDb(): StarDB {
  if (!_dbInstance) {
    try {
      _dbInstance = new StarDB();
    } catch (err) {
      _dbError = err instanceof Error ? err : new Error(String(err));
      console.error('[DB] Failed to create Dexie instance:', _dbError);
      throw _dbError;
    }
  }
  return _dbInstance;
}

/** Check if DB is operational */
export function isDbReady(): boolean {
  return _dbInstance !== null && _dbError === null;
}

export const db = getDb();

// ─── Settings ──────────────────────────────────────────────

/** Ensure settings record exists, merging defaults */
export async function getSettings(): Promise<AppSettings> {
  const d = getDb();
  try {
    let s = await d.settings.get('main');
    if (!s) {
      // Must include 'key' property explicitly — Dexie schema is 'settings: key'
      s = { key: 'main', ...DEFAULT_SETTINGS };
      await d.settings.put(s);
      return s;
    }
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      llm: { ...DEFAULT_SETTINGS.llm, ...(s.llm ?? {}) },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[DB] getSettings failed:', msg);
    console.warn('[DB] Falling back to default settings');
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const d = getDb();
  const s = await getSettings();
  const updated: AppSettings = { key: 'main', ...s, ...partial };
  if (partial.llm) {
    updated.llm = { ...s.llm, ...partial.llm };
  }
  await d.settings.put(updated);
  return updated;
}

/** Bulk upsert repos from GitHub API results */
export async function upsertRepos(repos: TaggedRepo[]): Promise<void> {
  const d = getDb();
  await d.transaction('rw', d.repos, async () => {
    for (const r of repos) {
      const existing = await d.repos.get(r.id);
      if (existing) {
        await d.repos.put({ ...r, tags: existing.tags, lastSyncedAt: Date.now() }, r.id);
      } else {
        await d.repos.put({ ...r, lastSyncedAt: Date.now() }, r.id);
      }
    }
  });
}

// ─── AI Cache ──────────────────────────────────────────────

export async function getAiCache(repoId: number): Promise<AiSuggestion | null> {
  const d = getDb();
  const entry = await d.aiCache.get(repoId);
  return entry?.suggestion ?? null;
}

export async function setAiCache(repoId: number, suggestion: AiSuggestion): Promise<void> {
  const d = getDb();
  await d.aiCache.put({ repoId, suggestion }, repoId);
}

export async function cleanAiCache(): Promise<void> {
  const d = getDb();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const all = await d.aiCache.toArray();
  for (const entry of all) {
    if (entry.suggestion.analyzedAt < cutoff) {
      await d.aiCache.delete(entry.repoId);
    }
  }
}

export async function getReposByCategory(category: string): Promise<TaggedRepo[]> {
  const d = getDb();
  const all = await d.repos.where('category').equals(category).toArray();
  return all.sort((a, b) => b.stars - a.stars);
}

export async function getReposBySubCategory(category: string, subCategory: string): Promise<TaggedRepo[]> {
  const d = getDb();
  const all = await d.repos.filter((r) => r.category === category && r.subCategory === subCategory).toArray();
  return all.sort((a, b) => b.stars - a.stars);
}

export async function getCategoryStats(): Promise<{ categoryCounts: Record<string, number>; uncategorized: number }> {
  const d = getDb();
  const all = await d.repos.toArray();
  const counts: Record<string, number> = {};
  let uncategorized = 0;
  for (const r of all) {
    const cat = r.category || 'uncategorized';
    if (cat === 'uncategorized') {
      uncategorized++;
    } else {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  return { categoryCounts: counts, uncategorized };
}

export async function getUnanalyzedRepos(): Promise<TaggedRepo[]> {
  const d = getDb();
  const repos = await d.repos.toArray();
  const analyzedIds = new Set((await d.aiCache.toArray()).map((e) => e.repoId));
  return repos.filter((r) => !analyzedIds.has(r.id));
}

// ─── Auto rules ─────────────────────────────────────────────

// ─── v1.2: Classification confidence & reclassification ───

/**
 * Update a repo's classification (category, subCategory, confidence).
 */
export async function updateRepoClassification(
  repoId: number,
  category: string,
  subCategory: string,
  confidence?: number,
): Promise<void> {
  const d = getDb();
  const updateData: Partial<TaggedRepo> = { category, subCategory };
  if (confidence !== undefined) {
    updateData.classificationConfidence = Math.min(100, Math.max(0, confidence));
  }
  await d.repos.update(repoId, updateData);
}

/** Get repos that need reclassification (low confidence or uncategorized) */
export async function getReposNeedingReclassification(): Promise<TaggedRepo[]> {
  const d = getDb();
  const all = await d.repos.toArray();
  return all.filter((r) => {
    // Uncategorized or low confidence or no classification
    if (!r.category || r.category === 'uncategorized') return true;
    const conf = r.classificationConfidence;
    if (conf === undefined || conf < 40) return true;
    return false;
  });
}

/** Reclassify a single repo using the rule engine, returns updated result */
export async function reclassifyRepo(repoId: number): Promise<{ category: string; subCategory: string; confidence: number } | null> {
  const d = getDb();
  const repo = await d.repos.get(repoId);
  if (!repo) return null;

  const result = classifyRepo({
    name: repo.name,
    fullName: repo.fullName,
    description: repo.description || '',
    language: repo.language || '',
    topics: repo.topics || [],
  });

  await updateRepoClassification(repoId, result.category, result.subCategory, result.confidence);
  return result;
}

export async function applyAutoRules(repo: TaggedRepo): Promise<string[]> {
  const d = getDb();
  const rules = await d.rules.toArray();
  const matched = new Set<string>();
  for (const rule of rules) {
    let hit = false;
    const val = rule.matchValue.toLowerCase();
    switch (rule.matchType) {
      case 'language':
        hit = (repo.language ?? '').toLowerCase() === val;
        break;
      case 'topic':
        hit = repo.topics.some((t) => t.toLowerCase() === val);
        break;
      case 'name_contains':
        hit = repo.name.toLowerCase().includes(val);
        break;
      case 'description_contains':
        hit = (repo.description ?? '').toLowerCase().includes(val);
        break;
    }
    if (hit) rule.tags.forEach((t) => matched.add(t));
  }
  return [...matched];
}

// ─── Category List Map ────────────────────────────────────

/**
 * Get cached GitHub list ID for a category key.
 */
export async function getCachedListId(categoryKey: string): Promise<{ listId: string; listName: string } | null> {
  const d = getDb();
  const entry = await d.categoryListMap.get(categoryKey);
  return entry ? { listId: entry.listId, listName: entry.listName } : null;
}

/**
 * Cache a GitHub list ID for a category key.
 */
export async function setCachedListId(categoryKey: string, listId: string, listName: string): Promise<void> {
  const d = getDb();
  await d.categoryListMap.put({ categoryKey, listId, listName }, categoryKey);
}

/**
 * Clear the entire category list map cache.
 */
export async function clearCategoryListCache(): Promise<void> {
  const d = getDb();
  await d.categoryListMap.clear();
}

// ─── Dynamic Categories (v1.3) ────────────────────────────

/**
 * Get all dynamic categories.
 */
export async function getDynamicCategories(): Promise<DynamicCategoryRecord[]> {
  const d = getDb();
  return d.dynamicCategories.toArray();
}

/**
 * Get a single dynamic category by key.
 */
export async function getDynamicCategory(key: string): Promise<DynamicCategoryRecord | undefined> {
  const d = getDb();
  return d.dynamicCategories.get(key);
}

/**
 * Save a dynamic category (create or update).
 */
export async function putDynamicCategory(cat: DynamicCategory): Promise<void> {
  const d = getDb();
  await d.dynamicCategories.put(cat as DynamicCategoryRecord, cat.key);
}

/**
 * Delete a dynamic category and unassign all repos in that category.
 */
export async function deleteDynamicCategory(key: string): Promise<number> {
  const d = getDb();
  // Unassign repos
  const repos = await d.repos.where('dynamicCategory').equals(key).toArray();
  for (const repo of repos) {
    await d.repos.update(repo.id, { dynamicCategory: '' });
  }
  // Delete the category
  await d.dynamicCategories.delete(key);
  return repos.length;
}

/**
 * Rename a dynamic category (update label only).
 */
export async function renameDynamicCategory(key: string, newLabel: string): Promise<void> {
  const d = getDb();
  const cat = await d.dynamicCategories.get(key);
  if (cat) {
    await d.dynamicCategories.put({ ...cat, label: newLabel }, key);
  }
}

/**
 * Get all uncategorized repos (rule-based + language fallback both failed).
 * These are repos with category='uncategorized' or without a meaningful dynamicCategory.
 */
export async function getUncategorizedRepos(): Promise<TaggedRepo[]> {
  const d = getDb();
  return d.repos
    .filter((r) => r.category === 'uncategorized' || r.category === '')
    .toArray();
}

/**
 * Count repos per dynamic category.
 */
export async function getDynamicCategoryStats(): Promise<Array<{
  key: string;
  label: string;
  icon: string;
  count: number;
}>> {
  const d = getDb();
  const cats = await d.dynamicCategories.toArray();
  const stats: Array<{ key: string; label: string; icon: string; count: number }> = [];

  for (const cat of cats) {
    const count = await d.repos
      .where('dynamicCategory')
      .equals(cat.key)
      .count();
    stats.push({
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      count,
    });
  }

  return stats.sort((a, b) => b.count - a.count);
}
