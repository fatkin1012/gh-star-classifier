// ============================================================
// Background sync — detect new stars and auto-classify
//
// v1.4: Unified AI-first classification.
//   - LLM now does BOTH category + tags in one call
//   - Rule-based is the fallback when LLM is unavailable
//   - No more separate dual-pass (rule-based then LLM tags)
// ============================================================

import { db, getSettings, updateSettings, applyAutoRules, setAiCache, getUncategorizedRepos, getDynamicCategories, putDynamicCategory } from './db';
import { fetchAllStars, checkTokenScopes } from './github';
import { classifyRepoWithLLM, fetchReadmeSummary } from './llm';
import { classifyRepoSync } from './classify';
import {
  ensureCategoryList,
  addRepoToList,
  resetEmptyDataLog,
} from './starlists';
import { syncDynamicCategories } from './dynamicCategory';
import type { TaggedRepo } from './types';

/**
 * Full sync: fetch all stars from GitHub and merge into DB.
 * 
 * v1.4 change: LLM classification now REPLACES rule-based for new repos
 * when LLM is configured and autoClassifyNew is enabled.
 * Rule-based is kept as fallback when LLM is unavailable or fails.
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
    await updateSettings({ tokenHasUserScope });
  }

  // Reset empty-data log counter for this sync cycle
  resetEmptyDataLog();

  // Find the newest starredAt we already have
  const newest = await db.repos
    .orderBy('starredAt')
    .last();
  const since = newest?.starredAt;

  const rawRepos = await fetchAllStars({ token, since });

  let newCount = 0;
  let autoTagged = 0;
  const listIdCache = new Map<string, string>();

  // ─── Determine if LLM should be used for new repos ──────────
  const useLLM = settings.llm.apiKey && settings.llm.autoClassifyNew;

  for (const raw of rawRepos) {
    const existing = await db.repos.get(raw.id);
    const isNew = !existing;
    if (isNew) newCount++;

    let tags = existing?.tags ?? [];
    let category: string;
    let subCategory: string;

    if (isNew && useLLM) {
      // ─── v1.5: AI-only classification (category + subCategory, no tags) ───
      try {
        const tagged: TaggedRepo = {
          ...raw, tags: [], category: '', subCategory: '', dynamicCategory: '', lastSyncedAt: Date.now(),
        };
        const readmeSummary = await fetchReadmeSummary(tagged);
        const suggestion = await classifyRepoWithLLM(tagged, readmeSummary, settings.llm);

        category = suggestion.category || '';
        subCategory = suggestion.subCategory || '';

        // v1.5: LLM no longer suggests tags — only category/subCategory
        // Cache the AI suggestion for reference
        await setAiCache(raw.id, { ...suggestion, analyzedAt: Date.now() });

        // Validate category against known taxonomy
        const validCategories = [
          'applications-tools', 'libraries-frameworks', 'boilerplates-starters',
          'awesome-lists-tutorials', 'scripts-dotfiles',
        ];
        if (!validCategories.includes(category)) {
          category = '';
          subCategory = '';
        }
      } catch (err) {
        console.warn(`[Sync] LLM classification failed for ${raw.fullName}, falling back to rules:`, err);
        const fallback = classifyRepoSync({
          name: raw.name,
          fullName: raw.fullName,
          description: raw.description || '',
          language: raw.language || '',
          topics: raw.topics,
        });
        category = fallback.category;
        subCategory = fallback.subCategory;
      }
    } else {
      // ─── Rule-based classification (fallback / for existing repos) ───
      const result = classifyRepoSync({
        name: raw.name,
        fullName: raw.fullName,
        description: raw.description || '',
        language: raw.language || '',
        topics: raw.topics,
      });
      category = result.category;
      subCategory = result.subCategory;
    }

    // Apply auto-classify rules (custom tags) if enabled
    if (settings.autoClassifyEnabled) {
      const autoTags = await applyAutoRules({
        ...raw, tags, category, subCategory, dynamicCategory: '', lastSyncedAt: 0,
      });
    // v1.2: Auto-classify into 5 standard categories with confidence
    const catResult = classifyRepo({
      name: raw.name,
      fullName: raw.fullName,
      description: raw.description || '',
      language: raw.language || '',
      topics: raw.topics,
    });
    const category = catResult.category;
    const subCategory = catResult.subCategory;
    const classificationConfidence = catResult.confidence;

    // Apply auto-classify rules (custom tags) if enabled
    if (settings.autoClassifyEnabled) {
      const autoTags = await applyAutoRules({ ...raw, tags: [], category: category, subCategory: subCategory, classificationConfidence, lastSyncedAt: 0 });

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

    await db.repos.put({
      ...raw, tags, category, subCategory, dynamicCategory: '', lastSyncedAt: Date.now(),
    }, raw.id);

    // ─── Sync to GitHub star lists (v1.2) ─────────────────────
    if (settings.syncToGitHubLists && tokenHasUserScope && category && category !== 'uncategorized' && raw.nodeId) {
    await db.repos.put({ ...raw, tags, category, subCategory, classificationConfidence, lastSyncedAt: Date.now() }, raw.id);
  }

  // ─── LLM auto-classify for new repos ───────────────────
  if (settings.llm.autoClassifyNew && settings.llm.apiKey && newCount > 0) {
    for (const raw of rawRepos) {
      // Reclassify the raw repo for the LLM analysis context
      const llmCatResult = classifyRepo({
        name: raw.name,
        fullName: raw.fullName,
        description: raw.description || '',
        language: raw.language || '',
        topics: raw.topics,
      });
      const tagged: TaggedRepo = { ...raw, tags: [], category: llmCatResult.category || '', subCategory: llmCatResult.subCategory || '', classificationConfidence: llmCatResult.confidence, lastSyncedAt: 0 };

      try {
        if (!listIdCache.has(category)) {
          const listId = await ensureCategoryList(token, category);
          listIdCache.set(category, listId);
        }
        const listId = listIdCache.get(category)!;
        await addRepoToList(token, listId, raw.nodeId);
      } catch (err) {
        if (!(err instanceof Error && (err.message.includes('scope') || err.message.includes('empty data')))) {
          console.warn(`[Sync] Could not sync ${raw.fullName}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  // ─── v1.3: Dynamic categories for remaining uncategorized repos ───────
  try {
    const uncategorized = await getUncategorizedRepos();
    if (uncategorized.length >= 3) {
      const dcResult = await syncDynamicCategories(
        uncategorized,
        () => getDynamicCategories(),
        async (cat) => { await putDynamicCategory(cat); },
        async (assignments) => {
          for (const [fullName, dcKey] of assignments) {
            const repo = await db.repos
              .filter((r) => r.fullName === fullName)
              .first();
            if (repo) {
              await db.repos.update(repo.id, { dynamicCategory: dcKey });
            }
          }
        }
      );
      if (dcResult.categoriesCreated > 0) {
        console.info(
          `[Sync] Created ${dcResult.categoriesCreated} dynamic categories, assigned ${dcResult.reposAssigned} repos`
        );
      }
    }
  } catch (err) {
    console.warn('[Sync] Dynamic category analysis failed:', err instanceof Error ? err.message : err);
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
 * Manual sync of classified repos to GitHub star lists.
 * Called from UI button (v1.4 feature).
 * Syncs all repos that have a valid category to their corresponding GitHub list.
 */
export async function syncToGitHubStarLists(token: string): Promise<{
  total: number;
  synced: number;
  skipped: number;
}> {
  const scopeResult = await checkTokenScopes(token);
  if (!scopeResult.hasUserScope) {
    throw new Error('Your token lacks the "user" scope. Update it at https://github.com/settings/tokens');
  }

  const allRepos = await db.repos.toArray();
  const categorized = allRepos.filter((r) => r.category && r.category !== 'uncategorized' && r.nodeId);

  let synced = 0;
  let skipped = 0;

  // Ensure all category lists exist first
  const listIdCache = new Map<string, string>();
  const uniqueCategories = [...new Set(categorized.map((r) => r.category))];

  resetEmptyDataLog();

  for (const catKey of uniqueCategories) {
    try {
      const listId = await ensureCategoryList(token, catKey);
      listIdCache.set(catKey, listId);
    } catch (err) {
      console.warn(`[SyncToLists] Failed to ensure list for ${catKey}:`, err);
    }
  }

  // Sync each repo
  for (const repo of categorized) {
    const listId = listIdCache.get(repo.category);
    if (!listId) {
      skipped++;
      continue;
    }

    try {
      const ok = await addRepoToList(token, listId, repo.nodeId);
      if (ok) synced++;
      else skipped++;
    } catch (err) {
      skipped++;
    }
  }

  return { total: categorized.length, synced, skipped };
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
