// ============================================================
// Background sync — detect new stars and auto-classify
// ============================================================

import { db, getSettings, applyAutoRules } from './db';
import { fetchAllStars } from './github';

/**
 * Full sync: fetch all stars from GitHub and merge into DB.
 * Returns counts for notification purposes.
 */
export async function fullSync(token: string): Promise<{
  total: number;
  new: number;
  autoTagged: number;
}> {
  const settings = await getSettings();

  // Find the newest starredAt we already have
  const newest = await db.repos
    .orderBy('starredAt')
    .last();

  const since = newest?.starredAt;

  const rawRepos = await fetchAllStars({
    token,
    since,
  });

  // Convert to TaggedRepo, apply auto-rules
  let newCount = 0;
  let autoTagged = 0;

  for (const raw of rawRepos) {
    const existing = await db.repos.get(raw.id);
    const isNew = !existing;
    if (isNew) newCount++;

    let tags = existing?.tags ?? [];

    // Apply auto-classify if enabled
    if (settings.autoClassifyEnabled) {
      const autoTags = await applyAutoRules({ ...raw, tags: [], lastSyncedAt: 0 });
      if (autoTags.length > 0) {
        const tagSet = new Set([...tags, ...autoTags]);
        tags = [...tagSet];
        autoTagged += autoTags.length;
      }
    }

    // Apply default tags for new stars
    if (isNew && settings.newStarDefaultTags?.length > 0) {
      const tagSet = new Set([...tags, ...settings.newStarDefaultTags]);
      tags = [...tagSet];
    }

    await db.repos.put({ ...raw, tags, lastSyncedAt: Date.now() }, raw.id);
  }

  return {
    total: rawRepos.length,
    new: newCount,
    autoTagged,
  };
}

/**
 * Lightweight check for new stars using API count.
 * Returns approximate number of new stars.
 */
export async function getNewStarCount(token: string): Promise<number> {
  const newest = await db.repos.orderBy('starredAt').last();
  if (!newest) return 0;

  try {
    // Fetch just the first page to check for new stars
    const rawRepos = await fetchAllStars({
      token,
      since: newest.starredAt,
      perPage: 100,
    });

    // Count how many are actually new
    let newCount = 0;
    for (const raw of rawRepos) {
      const existing = await db.repos.get(raw.id);
      if (!existing) newCount++;
    }
    return newCount;
  } catch {
    return 0;
  }
}

/**
 * Sync notification helper — called after sync completes.
 */
export function getSyncNotification(result: { total: number; new: number; autoTagged: number }): string {
  const parts: string[] = [];
  if (result.total > 0) parts.push(`${result.total} repos synced`);
  if (result.new > 0) parts.push(`${result.new} new stars`);
  if (result.autoTagged > 0) parts.push(`${result.autoTagged} auto-tags applied`);
  return parts.join(' · ') || 'No changes';
}
