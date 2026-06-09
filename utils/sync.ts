// ============================================================
// Background sync — detect new stars and auto-classify
// ============================================================

import { db, getSettings, applyAutoRules, setAiCache } from './db';
import { fetchAllStars } from './github';
import { analyzeRepo, fetchReadmeSummary } from './llm';
import { classifyRepo } from './classify';
import type { TaggedRepo } from './types';

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

    // v1.1: Auto-classify into 5 standard categories (always runs)
    const catResult = classifyRepo({
      name: raw.name,
      fullName: raw.fullName,
      description: raw.description || '',
      language: raw.language || '',
      topics: raw.topics,
    });
    const category = catResult.category;
    const subCategory = catResult.subCategory;

    // Apply auto-classify rules (custom tags) if enabled
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

    await db.repos.put({ ...raw, tags, category, subCategory, lastSyncedAt: Date.now() }, raw.id);
  }

  // ─── LLM auto-classify for new repos ───────────────────
  if (settings.llm.autoClassifyNew && settings.llm.apiKey && newCount > 0) {
    for (const raw of rawRepos) {
      const tagged: TaggedRepo = { ...raw, tags: [], lastSyncedAt: 0 };
      try {
        const readmeSummary = await fetchReadmeSummary(tagged);
        const suggestion = await analyzeRepo(tagged, readmeSummary, settings.llm);
        if (suggestion.tags.length > 0) {
          await setAiCache(raw.id, { ...suggestion, analyzedAt: Date.now() });
          const repo = await db.repos.get(raw.id);
          if (repo) {
            const merged = new Set([...repo.tags, ...suggestion.tags]);
            await db.repos.update(raw.id, { tags: [...merged] });
          }
        }
      } catch (err) {
        console.error(`[LLM sync] Failed for ${raw.fullName}:`, err);
      }
    }
  }

  return {
    total: rawRepos.length,
    new: newCount,
    autoTagged: autoTagged,
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
