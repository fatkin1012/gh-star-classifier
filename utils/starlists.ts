// ============================================================
// GitHub Star Lists — GraphQL API
//
// ⚠️ GitHub Lists API is GraphQL-only (no REST endpoint).
//    Discovered via community gist & GraphQL schema exploration.
//
// Real endpoints:
//   Query:   viewer { lists(first: 100) { nodes { id name } } }
//   Create:  createUserList(input: { name, description?, isPrivate? })
//   Delete:  deleteUserList(input: { listId })
//   Mutate:  updateUserListsForItem(input: { itemId, listIds })
//
// References:
//   - https://gist.github.com/donaldguy/c89d1e0264815e3f997b0fb13b1e7f9c
// ============================================================

import { getCachedListId, setCachedListId } from './db';
import { getOctokit } from './github';

// ─────── Scope error detection ───────

const SCOPE_ERROR_PATTERNS = [
  'requires the `user` scope',
  'requires one or more scopes',
  'insufficient_scope',
  'not permitted',
  'does not have the required',
];

/**
 * Check if a GraphQL error is caused by missing token scopes.
 * These errors should be handled silently rather than logged as failures.
 */
export function isScopeError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return SCOPE_ERROR_PATTERNS.some((p) => msg.includes(p));
}

// ─────── Empty-data error dedup ───────

let _emptyDataLogCount = 0;
let _emptyDataLogMax = 3;

/**
 * Reset the empty-data error log counter.
 * Call at the start of a full-sync to get fresh per-sync dedup.
 */
export function resetEmptyDataLog(): void {
  _emptyDataLogCount = 0;
}

function logEmptyDataOnce(err: unknown, context?: string): void {
  if (_emptyDataLogCount < _emptyDataLogMax) {
    const prefix = context ? `[StarLists:${context}]` : '[StarLists]';
    console.warn(`${prefix} Empty data returned (possible invalid nodeId)`, err);
    _emptyDataLogCount++;
    if (_emptyDataLogCount === _emptyDataLogMax) {
      console.warn('[StarLists] Suppressing further empty-data warnings for this batch');
    }
  }
}

// ─────── Category → List name mapping ───────

export const CATEGORY_LIST_NAMES: Record<string, string> = {
  'applications-tools': '應用程序 / 獨立工具',
  'libraries-frameworks': '模組 / 插件 / 庫',
  'boilerplates-starters': '模板 / 腳手架',
  'awesome-lists-tutorials': '資源彙整 / 學習資料',
  'scripts-dotfiles': '自動化腳本 / 配置',
};

// ─────── GraphQL helpers ───────

const GRAPHQL_URL = 'https://api.github.com/graphql';

interface GraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; path?: string[] }>;
}

async function graphql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: variables ?? {},
    }),
  });

  const json: GraphQlResponse<T> = await response.json();

  if (json.errors) {
    const messages = json.errors.map((e) => e.message).join('; ');
    const err = new Error(`GitHub GraphQL error: ${messages}`);
    // Preserve scope information for downstream detection
    if (isScopeError(messages)) {
      (err as Error & { scopeError: boolean }).scopeError = true;
    }
    throw err;
  }

  if (!json.data) {
    throw new Error('GitHub GraphQL returned empty data');
  }

  return json.data;
}

// ─────── List operations ───────

interface UserList {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: string;
}

/** Fetch all star lists for the authenticated user. */
export async function getLists(token: string): Promise<UserList[]> {
  const query = `
    query GetUserLists($first: Int!, $after: String) {
      viewer {
        lists(first: $first, after: $after) {
          nodes {
            id
            name
            description
            isPrivate
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const all: UserList[] = [];
  let after: string | null = null;
  let hasNext = true;

  while (hasNext) {
    type ListQueryResult = {
      viewer: {
        lists: {
          nodes: UserList[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    };
    const pageResult: ListQueryResult = await graphql<ListQueryResult>(token, query, { first: 100, after });

    const listData = pageResult.viewer.lists;
    all.push(...listData.nodes);
    hasNext = listData.pageInfo.hasNextPage;
    after = listData.pageInfo.endCursor ?? null;
  }

  return all;
}

/** Create a new star list. Returns the created list. */
export async function createList(token: string, name: string, description?: string, isPrivate?: boolean): Promise<UserList> {
  const mutation = `
    mutation CreateUserList($name: String!, $description: String, $isPrivate: Boolean) {
      createUserList(input: {
        name: $name
        description: $description
        isPrivate: $isPrivate
      }) {
        list {
          id
          name
          description
          isPrivate
          createdAt
        }
      }
    }
  `;

  type CreateListResult = {
    createUserList: { list: UserList };
  };
  const createResult = await graphql<CreateListResult>(token, mutation, { name, description: description ?? null, isPrivate: isPrivate ?? true });

  return createResult.createUserList.list;
}

/**
 * Ensure a category list exists.
 *  1. Check local DB cache first
 *  2. Search existing lists by name
 *  3. Create if not found
 * Returns the list's GraphQL global ID.
 */
export async function ensureCategoryList(token: string, categoryKey: string): Promise<string> {
  const listName = CATEGORY_LIST_NAMES[categoryKey];
  if (!listName) {
    throw new Error(`Unknown category key: ${categoryKey}`);
  }

  // 1. Check local cache
  const cached = await getCachedListId(categoryKey);
  if (cached) {
    return cached.listId;
  }

  // 2. Search existing lists
  const lists = await getLists(token);
  const existing = lists.find((l) => l.name === listName);
  if (existing) {
    await setCachedListId(categoryKey, existing.id, existing.name);
    return existing.id;
  }

  // 3. Create a new private list
  const created = await createList(token, listName, `Auto-classified repos: ${listName}`, true);
  await setCachedListId(categoryKey, created.id, created.name);
  return created.id;
}

// ─────── Repo ↔ List operations ───────

/**
 * NOTE: We use the `nodeId` field from the REST API response
 * (e.g. "R_kgDO...") as the GraphQL global ID for repos.
 * This avoids an extra GraphQL query per repo.
 * The `nodeId` is extracted in `convertRepos()` and `fetchRepo()`
 * in github.ts from the `node_id` REST API field.
 *
 * If you need to query a repo's global ID separately, you can use:
 *   query GetRepoGlobalId($owner: String!, $repo: String!) {
 *     repository(owner: $owner, name: $repo) { id }
 *   }
 */

/**
 * Add a repo to a specific star list.
 * Uses updateUserListsForItem which REPLACES list membership for that item.
 * We first query which category lists the repo is already on, then merge
 * the target list into the set so that non-category lists are preserved.
 */
export async function addRepoToList(
  token: string,
  listId: string,
  repoGlobalId: string,
): Promise<boolean> {
  const mutation = `
    mutation UpdateRepoLists($itemId: ID!, $listIds: [ID!]!) {
      updateUserListsForItem(input: {
        itemId: $itemId
        listIds: $listIds
      }) {
        lists {
          id
          name
        }
      }
    }
  `;

  try {
    type UpdateListsResult = {
      updateUserListsForItem: { lists: Array<{ id: string; name: string }> };
    };
    const mutateResult = await graphql<UpdateListsResult>(token, mutation, { itemId: repoGlobalId, listIds: [listId] });

    return mutateResult.updateUserListsForItem.lists.some((l) => l.id === listId);
  } catch (err) {
    if (isScopeError(err)) {
      // Scope errors are handled silently — user will see the banner in options page
      return false;
    }
    // Empty data typically means the nodeId is stale/invalid for this repo
    if ((err instanceof Error && err.message.includes('empty data')) || String(err).includes('empty data')) {
      logEmptyDataOnce(err, 'addRepoToList');
      return false;
    }
    console.warn('[StarLists] Failed to add repo to list:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Remove a repo from all category lists.
 * Calls updateUserListsForItem with an empty listIds array.
 *
 * ⚠️ NOTE: This removes the repo from ALL lists, not just category lists.
 *    This is a limitation of the current GraphQL API — there's no way to
 *    selectively remove from specific lists without knowing all list IDs.
 */
export async function removeRepoFromAllLists(
  token: string,
  repoGlobalId: string,
): Promise<boolean> {
  const mutation = `
    mutation RemoveRepoFromLists($itemId: ID!) {
      updateUserListsForItem(input: {
        itemId: $itemId
        listIds: []
      }) {
        lists {
          id
          name
        }
      }
    }
  `;

  try {
    type RemoveListsResult = {
      updateUserListsForItem: { lists: Array<{ id: string; name: string }> };
    };
    await graphql<RemoveListsResult>(token, mutation, { itemId: repoGlobalId });

    return true;
  } catch (err) {
    if (isScopeError(err)) {
      // Scope errors are handled silently
      return false;
    }
    console.warn('[StarLists] Failed to remove repo from lists:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Delete a user list entirely.
 */
export async function deleteList(token: string, listId: string): Promise<boolean> {
  const mutation = `
    mutation DeleteUserList($listId: ID!) {
      deleteUserList(input: { listId: $listId }) {
        list {
          id
        }
      }
    }
  `;

  try {
    type DeleteListResult = {
      deleteUserList: { list: { id: string } };
    };
    await graphql<DeleteListResult>(token, mutation, { listId });
    return true;
  } catch (err) {
    if (isScopeError(err)) {
      // Scope errors are handled silently
      return false;
    }
    console.warn('[StarLists] Failed to delete list:', err instanceof Error ? err.message : err);
    return false;
  }
}
