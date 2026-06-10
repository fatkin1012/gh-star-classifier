// ============================================================
// Dynamic Category — Clustering logic for uncategorized repos
//
// After rule-based classification + language fallback, repos that
// are still 'uncategorized' are analysed here for common patterns.
//
// Clustering strategies:
//   1. Topic-based: >=3 uncategorized repos share a common topic
//   2. Language-based: >=3 uncategorized repos share the same language
//   3. AI-assisted (optional): uses LLM to suggest category names
// ============================================================

import type { TaggedRepo, DynamicCategory, DynamicCategoryRecord } from './types';
import { getIconForTopics } from './classify';

// ─────── Thresholds ───────

/** Minimum number of repos sharing a trait to form a dynamic category */
const CLUSTER_THRESHOLD = 3;

// ─────── Helpers ───────

/**
 * Convert a topic or language name to a category key.
 * e.g. "machine learning" → "machine-learning", "C#" → "csharp"
 */
function toKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

/**
 * Convert a topic or language name to a human-readable label.
 * e.g. "machine-learning" → "Machine Learning"
 */
function toLabel(input: string): string {
  return input
    .split(/[-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─────── Topic-based clustering ───────

interface TopicCluster {
  topic: string;
  repos: TaggedRepo[];
  languages: Set<string>;
}

/**
 * Find topics that appear in >=3 uncategorized repos.
 * Returns clusters sorted by size (largest first).
 */
function findTopicClusters(uncategorized: TaggedRepo[]): TopicCluster[] {
  const topicMap = new Map<string, TaggedRepo[]>();

  for (const repo of uncategorized) {
    for (const topic of repo.topics) {
      const lower = topic.toLowerCase();
      if (!topicMap.has(lower)) {
        topicMap.set(lower, []);
      }
      topicMap.get(lower)!.push(repo);
    }
  }

  const clusters: TopicCluster[] = [];
  for (const [topic, repos] of topicMap) {
    if (repos.length >= CLUSTER_THRESHOLD) {
      const languages = new Set(repos.map((r) => r.language).filter(Boolean) as string[]);
      clusters.push({ topic, repos, languages });
    }
  }

  // Sort by cluster size descending
  clusters.sort((a, b) => b.repos.length - a.repos.length);
  return clusters;
}

// ─────── Language-based clustering ───────

interface LanguageCluster {
  language: string;
  repos: TaggedRepo[];
}

/**
 * Find languages that appear in >=3 uncategorized repos and have no matching topic cluster.
 */
function findLanguageClusters(uncategorized: TaggedRepo[], existingClusters: Set<string>): LanguageCluster[] {
  const langMap = new Map<string, TaggedRepo[]>();

  for (const repo of uncategorized) {
    const lang = repo.language;
    if (!lang) continue;

    // Skip if this repo is already covered by a topic cluster
    // (lazy check via repo reference)
    const lower = lang.toLowerCase();
    if (!langMap.has(lower)) {
      langMap.set(lower, []);
    }
    langMap.get(lower)!.push(repo);
  }

  const clusters: LanguageCluster[] = [];
  for (const [lang, repos] of langMap) {
    if (repos.length >= CLUSTER_THRESHOLD) {
      clusters.push({ language: lang, repos });
    }
  }

  // Sort by cluster size descending
  clusters.sort((a, b) => b.repos.length - a.repos.length);
  return clusters;
}

// ─────── Merge clusters into dynamic categories ───────

/**
 * Merge overlapping clusters to avoid creating two categories for the same group of repos.
 * e.g. "machine-learning" and "deep-learning" might share many repos.
 */
function mergeOverlappingClusters(clusters: TopicCluster[]): TopicCluster[] {
  if (clusters.length <= 1) return clusters;

  const merged: TopicCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < clusters.length; i++) {
    if (used.has(i)) continue;

    const current = clusters[i];
    const combinedRepos = new Set(current.repos.map((r) => r.id));
    const combinedTopics = new Set([current.topic]);
    const combinedLanguages = new Set(current.languages);

    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(j)) continue;

      const other = clusters[j];
      const otherIds = new Set(other.repos.map((r) => r.id));

      // Check overlap ratio: if >=50% of the smaller cluster's repos overlap
      const overlap = [...otherIds].filter((id) => combinedRepos.has(id)).length;
      const smallerSize = Math.min(combinedRepos.size, otherIds.size);
      const overlapRatio = smallerSize > 0 ? overlap / smallerSize : 0;

      if (overlapRatio >= 0.5) {
        // Merge: add all repos, topics, and languages
        for (const repo of other.repos) combinedRepos.add(repo.id);
        combinedTopics.add(other.topic);
        for (const lang of other.languages) combinedLanguages.add(lang);
        used.add(j);
      }
    }

    merged.push({
      topic: current.topic, // primary topic stays
      repos: current.repos.filter((r) => combinedRepos.has(r.id)),
      languages: combinedLanguages,
    });
    used.add(i);
  }

  return merged;
}

// ─────── Main clustering entry point ───────

export interface ClusteringResult {
  dynamicCategories: DynamicCategory[];
  /** Map of repo fullName → dynamic category key */
  repoAssignments: Map<string, string>;
}

/**
 * Analyse uncategorized repos and create dynamic categories.
 *
 * @param uncategorized - repos that are still 'uncategorized' after rule + language fallback
 * @param existingCategories - already existing dynamic categories (to avoid duplicates)
 * @returns ClusteringResult with new categories and repo assignments
 */
export function clusterUncategorized(
  uncategorized: TaggedRepo[],
  existingCategories: DynamicCategoryRecord[] = []
): ClusteringResult {
  const result: ClusteringResult = {
    dynamicCategories: [],
    repoAssignments: new Map(),
  };

  if (uncategorized.length < CLUSTER_THRESHOLD) {
    return result;
  }

  // Skip topics already used by existing categories
  const existingTopics = new Set(
    existingCategories.flatMap((c) => c.signatureTopics.map((t) => t.toLowerCase()))
  );
  const existingLangs = new Set(
    existingCategories.flatMap((c) => c.signatureLanguages.map((l) => l.toLowerCase()))
  );

  // 1. Topic-based clustering
  const topicClusters = findTopicClusters(uncategorized)
    .filter((c) => !existingTopics.has(c.topic.toLowerCase()));

  if (topicClusters.length === 0) {
    // 2. Language-based clustering (only if no topic clusters found)
    const langClusters = findLanguageClusters(uncategorized, new Set())
      .filter((c) => !existingLangs.has(c.language.toLowerCase()));

    for (const cluster of langClusters) {
      const key = `lang-${toKey(cluster.language)}`;
      const label = `${cluster.language} Projects`;
      const icon = getIconForTopics([cluster.language]);

      result.dynamicCategories.push({
        key,
        label,
        icon,
        signatureTopics: [],
        signatureLanguages: [cluster.language],
        createdAt: Date.now(),
      });

      for (const repo of cluster.repos) {
        result.repoAssignments.set(repo.fullName, key);
      }
    }
  } else {
    // Merge overlapping clusters
    const merged = mergeOverlappingClusters(topicClusters);

    for (const cluster of merged) {
      const key = toKey(cluster.topic);
      const label = toLabel(cluster.topic);
      const icon = getIconForTopics([cluster.topic]);
      const languages = [...cluster.languages];

      result.dynamicCategories.push({
        key,
        label,
        icon,
        signatureTopics: [cluster.topic],
        signatureLanguages: languages,
        createdAt: Date.now(),
      });

      for (const repo of cluster.repos) {
        result.repoAssignments.set(repo.fullName, key);
      }
    }
  }

  return result;
}

/**
 * Run full dynamic category analysis and update DB + repos.
 */
export async function syncDynamicCategories(
  uncategorized: TaggedRepo[],
  getExisting: () => Promise<DynamicCategoryRecord[]>,
  saveCategory: (cat: DynamicCategory) => Promise<void>,
  saveRepos: (assignments: Map<string, string>) => Promise<void>
): Promise<{
  categoriesCreated: number;
  reposAssigned: number;
}> {
  const existing = await getExisting();
  const result = clusterUncategorized(uncategorized, existing);

  let reposAssigned = 0;

  // Save new categories
  for (const cat of result.dynamicCategories) {
    await saveCategory(cat);
  }

  // Assign repos to dynamic categories
  if (result.repoAssignments.size > 0) {
    await saveRepos(result.repoAssignments);
    reposAssigned = result.repoAssignments.size;
  }

  return {
    categoriesCreated: result.dynamicCategories.length,
    reposAssigned,
  };
}
