// ============================================================
// Shared types for GitHub Star Classifier
// ============================================================

export interface StarredRepo {
  id: number;
  nodeId: string;   // GraphQL global ID (e.g. "R_kgDO...")
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  stars: number;
  forks: number;
  owner: string;
  ownerAvatar: string;
  topics: string[];
  createdAt: string; // ISO date
  updatedAt: string;
  starredAt: string; // ISO date when user starred it
}

/**
 * Repo stored in IndexedDB with user-assigned tags.
 * `id` matches GitHub repo id so we can upsert.
 * 
 * v1.1: Added category / subCategory for 5-category auto-classification.
 */
export interface TaggedRepo extends StarredRepo {
  tags: string[];
  category: string;       // v1.1: 主分類 key (e.g. "applications-tools")
  subCategory: string;    // v1.1: 子分類 key (e.g. "cli-tool")
  lastSyncedAt: number; // epoch ms
}

/**
 * User-defined auto-classify rules.
 */
export interface AutoTagRule {
  id?: number;
  name: string;
  /** Match type: 'language' | 'topic' | 'name_contains' | 'description_contains' */
  matchType: 'language' | 'topic' | 'name_contains' | 'description_contains';
  matchValue: string; // the value to match (case-insensitive)
  tags: string[]; // tags to apply
}

/**
 * Extension settings.
 */
export type LlmProvider = 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'deepseek';

export interface LlmSettings {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Custom system prompt for classification */
  customPrompt: string;
  /** Max repos to analyze in one batch */
  batchSize: number;
  /** If true, auto-analyze new stars during sync */
  autoClassifyNew: boolean;
}

/** Cached AI suggestion for a repo (stored in-memory, not persisted to DB directly) */
export interface AiSuggestion {
  tags: string[];
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  /** When this suggestion was generated */
  analyzedAt: number;
}

export interface AppSettings {
  /** Dexie primary key (always 'main' for settings table) */
  key?: string;
  githubToken: string | null;
  defaultTags: string[];
  autoClassifyEnabled: boolean;
  syncIntervalMinutes: number;
  /** Tags to auto-apply to all newly detected stars */
  newStarDefaultTags: string[];
  /** LLM classifier settings */
  llm: LlmSettings;
  /** If true, sync classification to GitHub star lists */
  syncToGitHubLists: boolean;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  provider: 'openai',
  apiKey: '',
  model: '',
  baseUrl: '',
  customPrompt: '',
  batchSize: 5,
  autoClassifyNew: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  githubToken: null,
  defaultTags: [],
  autoClassifyEnabled: true,
  syncIntervalMinutes: 30,
  newStarDefaultTags: [],
  llm: { ...DEFAULT_LLM_SETTINGS },
  syncToGitHubLists: true,
};
