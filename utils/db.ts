// ============================================================
// Dexie IndexedDB database
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { TaggedRepo, AutoTagRule, AppSettings, AiSuggestion } from './types';
import { DEFAULT_SETTINGS } from './types';

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

  constructor() {
    super('GitHubStarClassifier');
    
    // Single version with all tables.
    // NOTE: Use only '*tags' (multi-entry), not 'tags' + '*tags' which confuses Dexie.
    // This also auto-creates the aiCache table for existing v1 users.
    this.version(2).stores({
      repos: 'id, name, fullName, language, *tags, starredAt',
      rules: '++id, name, matchType',
      settings: 'key',
      aiCache: 'repoId',
    });
  }
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
      s = { ...DEFAULT_SETTINGS };
      await d.settings.put(s, 'main');
      return s;
    }
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      llm: { ...DEFAULT_SETTINGS.llm, ...(s.llm ?? {}) },
    };
  } catch (err) {
    // Log the actual error message, not just [object Object]
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[DB] getSettings failed:', msg);
    console.warn('[DB] Falling back to default settings');
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const d = getDb();
  const s = await getSettings();
  const updated = { ...s, ...partial } as AppSettings;
  if (partial.llm) {
    updated.llm = { ...s.llm, ...partial.llm };
  }
  await d.settings.put(updated, 'main');
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

export async function getUnanalyzedRepos(): Promise<TaggedRepo[]> {
  const d = getDb();
  const repos = await d.repos.toArray();
  const analyzedIds = new Set((await d.aiCache.toArray()).map((e) => e.repoId));
  return repos.filter((r) => !analyzedIds.has(r.id));
}

// ─── Auto rules ─────────────────────────────────────────────

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
