// ============================================================
// Tag management utilities
// ============================================================

import { db, getSettings } from './db';
import type { TaggedRepo } from './types';

/**
 * Get all unique tags across all repos.
 */
export async function getAllTags(): Promise<string[]> {
  const repos = await db.repos.toArray();
  const tagSet = new Set<string>();
  for (const r of repos) {
    for (const t of r.tags) {
      tagSet.add(t);
    }
  }
  return [...tagSet].sort();
}

/**
 * Add tags to a specific repo.
 */
export async function addTagsToRepo(repoId: number, newTags: string[]): Promise<void> {
  const repo = await db.repos.get(repoId);
  if (!repo) return;
  const existing = new Set(repo.tags);
  for (const t of newTags) existing.add(t);
  await db.repos.update(repoId, { tags: [...existing] });
}

/**
 * Remove tags from a specific repo.
 */
export async function removeTagsFromRepo(repoId: number, tagsToRemove: string[]): Promise<void> {
  const repo = await db.repos.get(repoId);
  if (!repo) return;
  const filtered = repo.tags.filter((t) => !tagsToRemove.includes(t));
  await db.repos.update(repoId, { tags: filtered });
}

/**
 * Set exact tags for a repo (replaces existing).
 */
export async function setRepoTags(repoId: number, tags: string[]): Promise<void> {
  await db.repos.update(repoId, { tags });
}

/**
 * Bulk tag multiple repos.
 */
export async function bulkTagRepos(repoIds: number[], tags: string[]): Promise<void> {
  await db.transaction('rw', db.repos, async () => {
    for (const id of repoIds) {
      const repo = await db.repos.get(id);
      if (!repo) continue;
      const existing = new Set(repo.tags);
      for (const t of tags) existing.add(t);
      await db.repos.update(id, { tags: [...existing] });
    }
  });
}

/**
 * Export all tags as JSON.
 */
export async function exportTagsJSON(): Promise<string> {
  const repos = await db.repos.toArray();
  const exportData = repos
    .filter((r) => r.tags.length > 0)
    .map((r) => ({
      id: r.id,
      fullName: r.fullName,
      tags: r.tags,
    }));
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), repos: exportData }, null, 2);
}

/**
 * Import tags from JSON. Merges with existing.
 */
export async function importTagsJSON(json: string): Promise<{ imported: number; skipped: number }> {
  const data = JSON.parse(json);
  if (!data.version || !Array.isArray(data.repos)) {
    throw new Error('Invalid import format');
  }
  let imported = 0;
  let skipped = 0;
  await db.transaction('rw', db.repos, async () => {
    for (const item of data.repos) {
      const existing = await db.repos.get(item.id);
      if (existing) {
        const merged = new Set([...existing.tags, ...(item.tags ?? [])]);
        await db.repos.update(item.id, { tags: [...merged] });
        imported++;
      } else {
        skipped++;
      }
    }
  });
  return { imported, skipped };
}
