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
  /** Cached AI analysis results */
  aiCache!: Table<AiCacheEntry, number>;

  constructor() {
    super('GitHubStarClassifier');
    this.version(1).stores({
      repos: 'id, name, fullName, language, tags, *tags, starredAt',
      rules: '++id, name, matchType',
      settings: 'key',
    });
    this.version(2).stores({
      repos: 'id, name, fullName, language, tags, *tags, starredAt',
      rules: '++id, name, matchType',
      settings: 'key',
      aiCache: 'repoId',
    });
  }
}

export const db = new StarDB();

/** Ensure settings record exists, merging defaults for any missing fields */
export async function getSettings(): Promise<AppSettings> {
  let s = await db.settings.get('main');
  if (!s) {
    s = { ...DEFAULT_SETTINGS };
    await db.settings.put(s, 'main');
    return s;
  }
  // Merge with defaults for backward compatibility (new fields after upgrades)
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...s, llm: { ...DEFAULT_SETTINGS.llm, ...(s.llm ?? {}) } };
  // Only persist if something actually changed
  const persisted: AppSettings = { ...DEFAULT_SETTINGS, ...s };
  if (s.llm) persisted.llm = s.llm;
  // Check for deep equality
  const chk = (a: AppSettings, b: AppSettings) => JSON.stringify(a) === JSON.stringify(b);
  if (!chk(merged, persisted)) {
    await db.settings.put(merged, 'main');
  }
  return merged;
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const s = await getSettings();
  const updated = { ...s, ...partial } as AppSettings;
  // Deep merge llm if provided
  if (partial.llm) {
    updated.llm = { ...s.llm, ...partial.llm };
  }
  await db.settings.put(updated, 'main');
  return updated;
}

/** Bulk upsert repos from GitHub API results */
export async function upsertRepos(repos: TaggedRepo[]): Promise<void> {
  await db.transaction('rw', db.repos, async () => {
    for (const r of repos) {
      const existing = await db.repos.get(r.id);
      if (existing) {
        // Preserve existing tags, update metadata
        await db.repos.put({ ...r, tags: existing.tags, lastSyncedAt: Date.now() }, r.id);
      } else {
        await db.repos.put({ ...r, lastSyncedAt: Date.now() }, r.id);
      }
    }
  });
}

// ─── AI Cache ──────────────────────────────────────────────

/** Get cached AI suggestion for a repo */
export async function getAiCache(repoId: number): Promise<AiSuggestion | null> {
  const entry = await db.aiCache.get(repoId);
  return entry?.suggestion ?? null;
}

/** Store AI suggestion cache */
export async function setAiCache(repoId: number, suggestion: AiSuggestion): Promise<void> {
  await db.aiCache.put({ repoId, suggestion }, repoId);
}

/** Clear stale AI cache entries (older than 7 days) */
export async function cleanAiCache(): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const all = await db.aiCache.toArray();
  for (const entry of all) {
    if (entry.suggestion.analyzedAt < cutoff) {
      await db.aiCache.delete(entry.repoId);
    }
  }
}

/** Get repos with no AI analysis yet */
export async function getUnanalyzedRepos(): Promise<TaggedRepo[]> {
  const repos = await db.repos.toArray();
  const analyzedIds = new Set((await db.aiCache.toArray()).map((e) => e.repoId));
  return repos.filter((r) => !analyzedIds.has(r.id));
}

// ─── Auto rules ─────────────────────────────────────────────

/** Apply auto-classify rules to a repo, return tags to add */
export async function applyAutoRules(repo: TaggedRepo): Promise<string[]> {
  const rules = await db.rules.toArray();
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
