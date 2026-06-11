// ============================================================
// Batch AI Classifier v1.2
// Analyzes ALL repos holistically to:
//  - Identify topic clusters and suggest consolidated categories
//  - Reclassify repos that are in the wrong category
//  - Propose new categories for uncategorized repos
//  - Merge similar dynamic categories (≥3 repos threshold)
// ============================================================

import { db, updateRepoClassification, getReposNeedingReclassification } from './db';
import { callLlm } from './llm';
import { CATEGORIES, classifyRepo } from './classify';
import type { TaggedRepo, LlmSettings, BatchClassificationResult, TopicCluster } from './types';

/** Build the holistic batch prompt */
function buildBatchPrompt(repos: TaggedRepo[], useFullContext: boolean): string {
  const existingCategories = CATEGORIES.map(
    (c) => `${c.key} (${c.label}): ${c.subCategories.map((s) => s.key).join(', ')}`
  ).join('\n');

  const repoList = repos.map((r) => {
    const line = `- fullName: ${r.fullName}
  description: ${(r.description || '').slice(0, 200)}
  language: ${r.language || 'Unknown'}
  topics: ${r.topics.join(', ') || '(none)'}
  currentCategory: ${r.category || 'uncategorized'}
  currentSubCategory: ${r.subCategory || ''}
  stars: ${r.stars}`;
    return line;
  }).join('\n');

  return `You are a GitHub repository classification expert. Analyze ALL the following repos holistically.

EXISTING CATEGORIES (use when a repo clearly fits):
${existingCategories}

RULES:
1. Group repos with similar topics into the SAME category. For example, agent-sdk, agent-framework, agent-tools should all be in "libraries-frameworks" or a new merged category if many (≥3 repos).
2. Only PROPOSE NEW CATEGORIES when ≥3 repos share a theme that doesn't fit existing categories.
3. Identify repos that are CLEARLY in the wrong category and suggest a better one.
4. For each repo, suggest the most appropriate existing category+subCategory OR "uncategorized".
5. Output ONLY valid JSON with no markdown fences.
6. Be conservative — only reclassify when confidence > 70%.

RESPONSE FORMAT:
{
  "assignments": [
    {
      "fullName": "owner/repo",
      "category": "existing-category-key",
      "subCategory": "existing-sub-key",
      "confidence": 85,
      "reasoning": "brief explanation"
    }
  ],
  "proposedCategories": [
    {
      "key": "new-category-key",
      "label": "New Category Display Name",
      "repos": ["owner/repo1", "owner/repo2"],
      "reason": "why this category is needed"
    }
  ],
  "reclassifications": [
    {
      "fullName": "owner/repo",
      "fromCategory": "current-wrong-category",
      "toCategory": "correct-category",
      "reason": "why it should be moved"
    }
  ]
}

REPOS TO ANALYZE (${repos.length} total):
${repoList}`;
}

/** Chunk repos into batches to avoid token limits */
function chunkRepos(repos: TaggedRepo[], batchSize: number): TaggedRepo[][] {
  const chunks: TaggedRepo[][] = [];
  for (let i = 0; i < repos.length; i += batchSize) {
    chunks.push(repos.slice(i, i + batchSize));
  }
  return chunks;
}

/** Merge multiple BatchClassificationResults */
function mergeResults(results: BatchClassificationResult[]): BatchClassificationResult {
  const seenAssignments = new Set<string>();
  const seenProposed = new Set<string>();
  const seenReclass = new Set<string>();

  const merged: BatchClassificationResult = {
    assignments: [],
    proposedCategories: [],
    reclassifications: [],
  };

  for (const r of results) {
    for (const a of r.assignments) {
      if (!seenAssignments.has(a.fullName)) {
        seenAssignments.add(a.fullName);
        merged.assignments.push(a);
      }
    }
    for (const p of r.proposedCategories) {
      if (!seenProposed.has(p.key)) {
        seenProposed.add(p.key);
        merged.proposedCategories.push(p);
      }
    }
    for (const re of r.reclassifications) {
      const key = `${re.fullName}:${re.fromCategory}->${re.toCategory}`;
      if (!seenReclass.has(key)) {
        seenReclass.add(key);
        merged.reclassifications.push(re);
      }
    }
  }

  return merged;
}

/** Parse the LLM batch response */
function parseBatchResponse(raw: string): BatchClassificationResult {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
      proposedCategories: Array.isArray(parsed.proposedCategories) ? parsed.proposedCategories : [],
      reclassifications: Array.isArray(parsed.reclassifications) ? parsed.reclassifications : [],
    };
  } catch {
    // Fallback: try to extract meaningful info
    console.warn('[BatchAI] Failed to parse batch response, returning empty result');
    return {
      assignments: [],
      proposedCategories: [],
      reclassifications: [],
    };
  }
}

/**
 * Run batch AI classification on all repos.
 * Returns a BatchClassificationResult with assignments, proposals, and reclassifications.
 */
export async function runBatchClassification(
  repos: TaggedRepo[],
  config: LlmSettings,
  onProgress?: (status: string) => void,
): Promise<BatchClassificationResult> {
  onProgress?.('Starting batch AI analysis...');

  if (repos.length === 0) return { assignments: [], proposedCategories: [], reclassifications: [] };

  // Determine batch size (AI can handle more in one go with holistic analysis)
  const batchSize = Math.min(config.batchSize * 3, 30);
  const chunks = chunkRepos(repos, batchSize);
  const results: BatchClassificationResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress?.(`Batch ${i + 1}/${chunks.length}: Analyzing ${chunk.length} repos...`);

    const prompt = buildBatchPrompt(chunk, true);
    const raw = await callLlm(prompt, {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      customPrompt: '',
      batchSize: config.batchSize,
      autoClassifyNew: false,
    });

    const parsed = parseBatchResponse(raw);
    results.push(parsed);

    // Avoid rate limits between chunks
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const merged = mergeResults(results);
  onProgress?.(`✓ Batch analysis complete: ${merged.assignments.length} suggestions`);

  return merged;
}

/**
 * Run AI analysis to identify topic clusters across ALL repos.
 * Returns topic clusters that can be used to suggest consolidated categories.
 */
export async function identifyTopicClusters(
  repos: TaggedRepo[],
  config: LlmSettings,
  onProgress?: (status: string) => void,
): Promise<TopicCluster[]> {
  onProgress?.('Identifying topic clusters across all repos...');

  if (repos.length === 0) return [];

  const repoList = repos.map((r) =>
    `${r.fullName} | topics: ${r.topics.join(', ') || '(none)'} | desc: ${(r.description || '').slice(0, 150)} | cat: ${r.category || 'uncategorized'}`
  ).join('\n');

  const prompt = `You are a topic clustering expert for GitHub repositories.

Analyze the following list of repos and identify NATURAL TOPIC CLUSTERS.
Rules:
1. Group repos that share similar topics, domains, or use-cases
2. Each cluster should have at least 3 repos (unless very unique)
3. Suggest a clear category name for each cluster
4. Repos can belong to at most one cluster
5. Clusters should be MUTUALLY EXCLUSIVE — don't put the same repo in two clusters
6. If repos already belong to a good existing category, note it
7. Output ONLY valid JSON, no markdown, no code fences.

RESPONSE FORMAT:
{
  "clusters": [
    {
      "clusterName": "AI/ML SDKs & Frameworks",
      "repos": ["owner/repo1", "owner/repo2", "owner/repo3"],
      "suggestedCategory": "libraries-frameworks"
    }
  ]
}

REPOS TO CLUSTER:
${repoList}`;

  try {
    const raw = await callLlm(prompt, {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      customPrompt: '',
      batchSize: config.batchSize,
      autoClassifyNew: false,
    });

    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(cleaned);
    const clusters: TopicCluster[] = Array.isArray(parsed.clusters) ? parsed.clusters : [];

    // Filter: only keep clusters with ≥3 repos
    onProgress?.(`✓ Found ${clusters.length} topic clusters`);
    return clusters.filter((c) => c.repos.length >= 3);
  } catch (err) {
    console.error('[BatchAI] Topic clustering failed:', err);
    onProgress?.('✗ Topic clustering failed');
    return [];
  }
}

/**
 * Apply batch classification results to the database.
 * Returns counts of what was applied.
 */
export async function applyBatchClassification(result: BatchClassificationResult): Promise<{
  classified: number;
  reclassified: number;
  proposed: number;
}> {
  let classified = 0;
  let reclassified = 0;

  // Apply category assignments
  for (const assignment of result.assignments) {
    const repo = await db.repos.filter((r) => r.fullName === assignment.fullName).first();
    if (!repo) continue;

    const shouldUpdate =
      repo.category !== assignment.category ||
      repo.subCategory !== assignment.subCategory ||
      (repo.classificationConfidence ?? 0) < assignment.confidence;

    if (shouldUpdate) {
      await updateRepoClassification(repo.id, assignment.category, assignment.subCategory, assignment.confidence);
      classified++;
    }
  }

  // Apply reclassifications
  for (const re of result.reclassifications) {
    const repo = await db.repos.filter((r) => r.fullName === re.fullName).first();
    if (!repo) continue;

    await updateRepoClassification(repo.id, re.toCategory, '', 85);
    reclassified++;
  }

  return {
    classified,
    reclassified,
    proposed: result.proposedCategories.length,
  };
}

/**
 * One-shot: run full batch analysis pipeline.
 * 1. Collect all repos
 * 2. Identify topic clusters
 * 3. Run batch classification
 * 4. Apply results to DB
 * 5. Return summary
 */
export async function fullBatchAnalysis(
  config: LlmSettings,
  onProgress?: (status: string) => void,
): Promise<{
  summary: string;
  clusters: TopicCluster[];
  result: BatchClassificationResult;
  applied: { classified: number; reclassified: number; proposed: number };
}> {
  // Phase 1: Collect repos
  onProgress?.('Collecting repos from database...');
  const allRepos = await db.repos.toArray();

  if (allRepos.length === 0) {
    return {
      summary: 'No repos in database. Sync your GitHub stars first.',
      clusters: [],
      result: { assignments: [], proposedCategories: [], reclassifications: [] },
      applied: { classified: 0, reclassified: 0, proposed: 0 },
    };
  }

  // Phase 2: Identify topic clusters
  const clusters = await identifyTopicClusters(allRepos, config, onProgress);

  // Phase 3: Run batch classification
  const result = await runBatchClassification(allRepos, config, onProgress);

  // Phase 4: Apply results to DB
  onProgress?.('Applying results to database...');
  const applied = await applyBatchClassification(result);

  // Build summary
  const parts: string[] = [];
  if (applied.classified > 0) parts.push(`${applied.classified} repos classified`);
  if (applied.reclassified > 0) parts.push(`${applied.reclassified} repos reclassified`);
  if (applied.proposed > 0) parts.push(`${applied.proposed} new categories proposed`);
  if (clusters.length > 0) parts.push(`${clusters.length} topic clusters identified`);

  const summary = parts.length > 0
    ? `✓ Batch analysis complete: ${parts.join(', ')}`
    : '✓ Batch analysis complete — no changes needed';

  return { summary, clusters, result, applied };
}
