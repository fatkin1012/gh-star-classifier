// ============================================================
// GitHub API service using Octokit
// ============================================================

import { Octokit } from '@octokit/rest';
import type { StarredRepo } from './types';

let _octokit: Octokit | null = null;
let _currentToken: string | null = null;

export function getOctokit(token: string): Octokit {
  if (!_octokit || _currentToken !== token) {
    _octokit = new Octokit({ auth: token });
    _currentToken = token;
  }
  return _octokit;
}

export function clearOctokit(): void {
  _octokit = null;
  _currentToken = null;
}

export interface FetchStarsOptions {
  token: string;
  username?: string;
  perPage?: number;
  /** If provided, only fetch repos starred after this date (ISO) */
  since?: string;
  /** Progress callback */
  onPage?: (page: number, repos: StarredRepo[]) => void;
  signal?: AbortSignal;
}

/**
 * Fetch all starred repos with pagination.
 * Defaults to authenticated user if no username provided.
 */
export async function fetchAllStars(opts: FetchStarsOptions): Promise<StarredRepo[]> {
  const octokit = getOctokit(opts.token);
  const perPage = opts.perPage ?? 100;
  const all: StarredRepo[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const params: Record<string, unknown> = {
      per_page: perPage,
      page,
      sort: 'created',
      direction: 'desc',
    };
    if (opts.since) params.since = opts.since;

    let endpoint: string;
    if (opts.username) {
      endpoint = 'GET /users/{username}/starred';
      params.username = opts.username;
    } else {
      endpoint = 'GET /user/starred';
    }

    // Octokit v21 uses the request method differently
    const { data } = await octokit.request(endpoint, params);
    const items = data as Array<Record<string, unknown>>;

    if (opts.onPage) {
      opts.onPage(page, convertRepos(items));
    }
    all.push(...convertRepos(items));

    hasMore = items.length === perPage;
    page++;
  }

  return all;
}

function convertRepos(items: Array<Record<string, unknown>>): StarredRepo[] {
  return items.map((item: Record<string, unknown>) => ({
    id: item.id as number,
    nodeId: (item.node_id as string) ?? '',
    name: (item.name as string) ?? '',
    fullName: (item.full_name as string) ?? '',
    description: (item.description as string | null) ?? null,
    htmlUrl: (item.html_url as string) ?? '',
    language: (item.language as string | null) ?? null,
    stars: (item.stargazers_count as number) ?? 0,
    forks: (item.forks_count as number) ?? 0,
    owner: ((item.owner as Record<string, unknown>)?.login as string) ?? '',
    ownerAvatar: ((item.owner as Record<string, unknown>)?.avatar_url as string) ?? '',
    topics: (item.topics as string[]) ?? [],
    createdAt: (item.created_at as string) ?? '',
    updatedAt: (item.updated_at as string) ?? '',
    starredAt: (item.starred_at as string) ?? '',
  }));
}

/** Verify that a GitHub token is valid (returns the username) */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const octokit = getOctokit(token);
    const { data } = await octokit.rest.users.getAuthenticated();
    return data.login;
  } catch {
    return null;
  }
}

/** Fetch a single repo by owner/name */
export async function fetchRepo(token: string, owner: string, repo: string): Promise<StarredRepo | null> {
  try {
    const octokit = getOctokit(token);
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return {
      id: data.id,
      nodeId: data.node_id,
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      htmlUrl: data.html_url,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      owner: data.owner.login,
      ownerAvatar: data.owner.avatar_url,
      topics: data.topics ?? [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      starredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
