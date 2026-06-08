// ============================================================
// Shared types for GitHub Star Classifier
// ============================================================

export interface StarredRepo {
  id: number;
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
 */
export interface TaggedRepo extends StarredRepo {
  tags: string[];
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
export interface AppSettings {
  githubToken: string | null;
  defaultTags: string[];
  autoClassifyEnabled: boolean;
  syncIntervalMinutes: number;
  /** Tags to auto-apply to all newly detected stars */
  newStarDefaultTags: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  githubToken: null,
  defaultTags: [],
  autoClassifyEnabled: true,
  syncIntervalMinutes: 30,
  newStarDefaultTags: [],
};
