// ============================================================
// LLM Classification Service
// Supports: OpenAI-compatible, Anthropic Claude, Ollama
// ============================================================

import { getSettings } from './db';
import type { TaggedRepo, LlmProvider, AiSuggestion } from './types';

export type { LlmProvider };
export type { AiSuggestion };

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string; // custom endpoint, e.g. for Ollama or proxy
  /** System prompt / taxonomy to guide classification */
  customPrompt: string;
  /** Max repos to analyze in one batch (to avoid token blowout) */
  batchSize: number;
  /** If true, LLM will suggest tags for all new repos during sync */
  autoClassifyNew: boolean;
}

const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  baseUrl: '',
  customPrompt: '',
  batchSize: 10,
  autoClassifyNew: false,
};

export function getDefaultLlmConfig(): LlmConfig {
  return { ...DEFAULT_LLM_CONFIG };
}

/** Get provider-specific default model and base URL */
export function getProviderDefaults(provider: LlmProvider): { model: string; baseUrl: string } {
  switch (provider) {
    case 'openai':
      return { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' };
    case 'openrouter':
      return { model: 'openai/gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/v1' };
    case 'anthropic':
      return { model: 'claude-3-5-haiku-latest', baseUrl: 'https://api.anthropic.com/v1' };
    case 'ollama':
      return { model: 'llama3.2:3b', baseUrl: 'http://localhost:11434/v1' };
    case 'deepseek':
      return { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' };
  }
}

// ─── Prompt templates ────────────────────────────────────────

const DEFAULT_TAXONOMY_PROMPT = `You are a GitHub repository classifier. Analyze the repo and suggest tags.

Rules:
1. Suggest 1-5 tags that best describe the repo
2. Tags should be short, single words or compound words (e.g. "machine-learning", "web-framework")
3. Prioritize: primary language/framework → domain → use case → tooling
4. Output ONLY valid JSON with no markdown, no code fences, no extra text

Response format:
{
  "tags": ["tag1", "tag2"],
  "reasoning": "very brief explanation",
  "confidence": "high" | "medium" | "low"
}

Examples:
- {"tags": ["python", "machine-learning", "deep-learning", "pytorch"], "reasoning": "Deep learning framework built on PyTorch", "confidence": "high"}
- {"tags": ["typescript", "react", "ui-components"], "reasoning": "React component library with TypeScript", "confidence": "high"}
- {"tags": ["go", "database", "cli"], "reasoning": "A Go-based database CLI tool", "confidence": "medium"}

Now classify this repository:
Name: {name}
Description: {description}
Language: {language}
Topics: {topics}
README summary (first 500 chars): {readmeSummary}`;

// ─── LLM API calls ──────────────────────────────────────────

async function callOpenAI(prompt: string, config: LlmConfig): Promise<string> {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'You are a precise repository classifier. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(prompt: string, config: LlmConfig): Promise<string> {
  const baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'user', content: prompt },
      ],
      system: 'You are a precise repository classifier. Respond only with valid JSON.',
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const content = data.content ?? [];
  return content.map((c: { text: string }) => c.text).join('');
}

async function callOllama(prompt: string, config: LlmConfig): Promise<string> {
  const baseUrl = config.baseUrl || 'http://localhost:11434/v1';
  // Ollama uses OpenAI-compatible /v1/chat/completions endpoint
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'You are a precise repository classifier. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Ollama API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** Call the configured LLM provider with a prompt, return raw text response */
async function callLlm(prompt: string, config: LlmConfig): Promise<string> {
  switch (config.provider) {
    case 'openai':
    case 'openrouter':
    case 'deepseek':
      return callOpenAI(prompt, config);
    case 'anthropic':
      return callAnthropic(prompt, config);
    case 'ollama':
      return callOllama(prompt, config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/** Validate an LLM config by making a minimal API call */
export async function validateLlmConfig(config: LlmConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey && config.provider !== 'ollama') {
    return { ok: false, message: 'API key is required' };
  }
  try {
    const testPrompt = 'Respond with just the word "ok" and nothing else.';
    const response = await callLlm(testPrompt, config);
    if (response.toLowerCase().includes('ok')) {
      return { ok: true, message: 'Connection successful' };
    }
    return { ok: true, message: 'Connected (unexpected response format)' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

// ─── Repo analysis ───────────────────────────────────────────

/** Build the classification prompt for a repo */
function buildPrompt(
  repo: TaggedRepo,
  readmeSummary: string,
  customPrompt?: string,
): string {
  const template = customPrompt || DEFAULT_TAXONOMY_PROMPT;
  return template
    .replace('{name}', repo.fullName)
    .replace('{description}', repo.description ?? 'No description')
    .replace('{language}', repo.language ?? 'Unknown')
    .replace('{topics}', repo.topics.join(', ') || '(none)')
    .replace('{readmeSummary}', readmeSummary.slice(0, 500));
}

/** Parse LLM response into AiSuggestion (tolerates markdown fences) */
function parseSuggestion(raw: string): AiSuggestion {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence)
        ? parsed.confidence
        : 'low',
      analyzedAt: Date.now(),
    };
  } catch {
    // Fallback: try to extract tags manually
    const tagMatch = cleaned.match(/"tags"\s*:\s*\[([^\]]+)\]/);
    const tags = tagMatch
      ? tagMatch[1].split(',').map((t) => t.replace(/["'\s]/g, '')).filter(Boolean)
      : [];
    return {
      tags,
      reasoning: 'Parsed from LLM output (fallback)',
      confidence: 'low',
      analyzedAt: Date.now(),
    };
  }
}

/** Save AI suggestions to a repo in the database */
export async function saveAiSuggestion(repoId: number, suggestion: AiSuggestion): Promise<void> {
  const { db } = await import('./db');
  const repo = await db.repos.get(repoId);
  if (!repo) return;

  // Merge AI suggestions into tags (without overwriting existing)
  const existingTags = new Set(repo.tags);
  const newTags = suggestion.tags.filter((t) => !existingTags.has(t));

  // Store suggestion metadata via a custom field (we'll use a separate table for AI cache)
  await db.repos.update(repoId, {
    tags: [...repo.tags, ...newTags],
  });
}

/** Analyze a single repo with LLM */
export async function analyzeRepo(
  repo: TaggedRepo,
  readmeSummary: string,
  config: LlmConfig,
): Promise<AiSuggestion> {
  const prompt = buildPrompt(repo, readmeSummary, config.customPrompt);
  const raw = await callLlm(prompt, config);
  return parseSuggestion(raw);
}

/** Batch analyze multiple repos with LLM, returns suggestions map */
export async function batchAnalyze(
  repos: TaggedRepo[],
  getReadmeSummary: (repo: TaggedRepo) => Promise<string>,
  config: LlmConfig,
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<Map<number, AiSuggestion>> {
  const results = new Map<number, AiSuggestion>();
  const batch = repos.slice(0, config.batchSize);

  for (let i = 0; i < batch.length; i++) {
    const repo = batch[i];
    onProgress?.(i + 1, batch.length, repo.fullName);
    try {
      const readmeSummary = await getReadmeSummary(repo);
      const suggestion = await analyzeRepo(repo, readmeSummary, config);
      results.set(repo.id, suggestion);
      // Small delay to avoid rate limits
      if (i < batch.length - 1) await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[LLM] Failed to analyze ${repo.fullName}:`, err);
    }
  }

  return results;
}

// ─── README fetcher (reuses GitHub API) ──────────────────────

import { getOctokit } from './github';

/** Fetch and summarize a repo's README */
export async function fetchReadmeSummary(repo: TaggedRepo): Promise<string> {
  try {
    const settings = await getSettings();
    if (!settings.githubToken) return '';

    const octokit = getOctokit(settings.githubToken);
    const [owner, repoName] = repo.fullName.split('/');

    const { data } = await octokit.rest.repos.getReadme({ owner, repo: repoName });
    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    // Return first 800 chars: title + description + first meaningful paragraph
    const lines = content.split('\n').filter((l) => l.trim());
    const summary = lines
      .filter((l) => !l.startsWith('```') && !l.startsWith('|') && !l.startsWith('!['))
      .slice(0, 20)
      .join(' ')
      .replace(/[#*`]/g, '')
      .trim();

    return summary.slice(0, 800);
  } catch {
    return '';
  }
}

/** Get untagged repos (ones without any AI-suggestable tags) */
export async function getUntaggedRepos(): Promise<TaggedRepo[]> {
  const { db } = await import('./db');
  const all = await db.repos.toArray();
  return all.filter((r) => r.tags.length === 0);
}
