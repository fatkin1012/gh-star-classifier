// ============================================================
// Background Service Worker
// ============================================================

import { defineBackground } from 'wxt/utils/define-background';
import { db, getSettings } from '../utils/db';
import { fullSync } from '../utils/sync';
import { addTagsToRepo, removeTagsFromRepo } from '../utils/tags';

export default defineBackground(() => {
  console.log('[Star Classifier] Background service worker started');

  // --- Periodic sync via alarms ---
  async function initAlarm() {
    const settings = await getSettings();
    if (settings.githubToken) {
      await browser.alarms.create('sync-stars', {
        periodInMinutes: settings.syncIntervalMinutes,
      });
      console.log(`[Star Classifier] Sync alarm set for every ${settings.syncIntervalMinutes} minutes`);
    }
  }

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'sync-stars') {
      console.log('[Star Classifier] Running periodic sync...');
      try {
        const settings = await getSettings();
        if (!settings.githubToken) return;
        const result = await fullSync(settings.githubToken);
        console.log('[Star Classifier] Sync complete:', result);
        if (result.new > 0) {
          await browser.action.setBadgeText({ text: String(result.new) });
          await browser.action.setBadgeBackgroundColor({ color: '#2563eb' });
        }
      } catch (err) {
        console.error('[Star Classifier] Sync failed:', err);
      }
    }
  });

  initAlarm();

  // --- Handle messages from content script / popup ---
  browser.runtime.onMessage.addListener(async (message, sender) => {
    switch (message.type) {
      case 'SYNC_NOW': {
        try {
          const settings = await getSettings();
          if (!settings.githubToken) {
            return { ok: false, error: 'Token not configured' };
          }
          const result = await fullSync(settings.githubToken);
          return { ok: true, result };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }

      case 'CHECK_STARRED': {
        // Content script asks: is this repo already in our DB?
        const { repoId } = message;
        const repo = await db.repos.get(repoId);
        return { exists: !!repo, tags: repo?.tags ?? [] };
      }

      case 'ADD_TAG': {
        const { repoId: aRepoId, tags: aTags } = message;
        try {
          await addTagsToRepo(aRepoId, aTags);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }

      case 'REMOVE_TAG': {
        const { repoId: rRepoId, tags: rTags } = message;
        try {
          await removeTagsFromRepo(rRepoId, rTags);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }

      case 'GET_STATS': {
        const count = await db.repos.count();
        const newest = await db.repos.orderBy('lastSyncedAt').last();
        return {
          totalCount: count,
          lastSyncedAt: newest?.lastSyncedAt ?? null,
        };
      }

      case 'CLEAR_BADGE': {
        await browser.action.setBadgeText({ text: '' });
        return { ok: true };
      }

      default:
        return { ok: false, error: `Unknown message type: ${message.type}` };
    }
  });

  // --- Clear badge when popup opens ---
  browser.action.onClicked.addListener(async () => {
    await browser.action.setBadgeText({ text: '' });
  });
});
