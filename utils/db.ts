// ============================================================
// Dexie IndexedDB database
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { TaggedRepo, AutoTagRule, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

export class StarDB extends Dexie {
  repos!: Table<TaggedRepo, number>;
  rules!: Table<AutoTagRule, number>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('GitHubStarClassifier');
    this.version(1).stores({
      repos: 'id, name, fullName, language, tags, *tags, starredAt',
      rules: '++id, name, matchType',
      settings: 'key',
    });
  }
}

export const db = new StarDB();

/** Ensure settings record exists */
export async function getSettings(): Promise<AppSettings> {
  let s = await db.settings.get('main');
  if (!s) {
    // DEFAULT_SETTINGS already imported at top
    s = { ...DEFAULT_SETTINGS };
    await db.settings.put(s, 'main');
  }
  return s;
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const s = await getSettings();
  const updated = { ...s, ...partial };
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
