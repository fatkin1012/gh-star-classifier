// ============================================================
// Background sync — detect new stars and auto-classify
// ============================================================

import { db, getSettings, updateSettings, applyAutoRules, setAiCache } from './db';
import { fetchAllStars, checkTokenScopes } from './github';
import { analyzeRepo, fetchReadmeSummary } from './llm';
import { classifyRepo } from './classify';
import {
  ensureCategoryList,
  addRepoToList,
  resetEmptyDataLog,
} from './starlists';
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

  // ─── Scope check: skip GitHub Lists sync if token lacks 'user' scope ───
  let tokenHasUserScope = settings.tokenHasUserScope ?? true;
  if (settings.syncToGitHubLists && token) {
    const scopeResult = await checkTokenScopes(token);
    tokenHasUserScope = scopeResult.hasUserScope;
    if (!tokenHasUserScope) {
      console.info('[Sync] Token lacks "user" scope — skipping GitHub Lists sync (silent)');
    }
    // Persist the scope check so the options page can read it
    await updateSettings({ tokenHasUserScope });
  }

  // Reset empty-data log counter for this sync cycle
  resetEmptyDataLog();

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
  // Cache category list IDs by category key to avoid redundant API calls
  const listIdCache = new Map<string, string>();

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
      const autoTags = await applyAutoRules({ ...raw, tags: [], category: '', subCategory: '', lastSyncedAt: 0 });
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

    // ─── Sync to GitHub star lists (v1.2) ─────────────────────
    if (settings.syncToGitHubLists && tokenHasUserScope && category && category !== 'uncategorized' && raw.nodeId) {
      try {
        // Get or create the category list (cached per category per sync)
        if (!listIdCache.has(category)) {
          const listId = await ensureCategoryList(token, category);
          listIdCache.set(category, listId);
        }
        const listId = listIdCache.get(category)!;
        await addRepoToList(token, listId, raw.nodeId);
      } catch (err) {
        // Individual failures are already handled in starlists.ts
        // Log a brief warning only for non-scope, non-empty-data errors
        if (!(err instanceof Error && (err.message.includes('scope') || err.message.includes('empty data')))) {
          console.warn(`[Sync] Could not sync ${raw.fullName}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  // ─── LLM auto-classify for new repos ───────────────────
  if (settings.llm.autoClassifyNew && settings.llm.apiKey && newCount > 0) {
    for (const raw of rawRepos) {
      // Re-classify for the LLM section (variables not in scope here)
      const llmCatResult = classifyRepo({
        name: raw.name,
        fullName: raw.fullName,
        description: raw.description || '',
        language: raw.language || '',
        topics: raw.topics,
      });
      const tagged: TaggedRepo = { ...raw, tags: [], category: llmCatResult.category || '', subCategory: llmCatResult.subCategory || '', lastSyncedAt: 0 };
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
