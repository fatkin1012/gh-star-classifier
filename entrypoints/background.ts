// ============================================================
// Background Service Worker
// ============================================================

import { defineBackground } from 'wxt/utils/define-background';
import { db, getSettings } from '../utils/db';
import { fullSync } from '../utils/sync';
import { addTagsToRepo, removeTagsFromRepo } from '../utils/tags';

export default defineBackground(() => {
  console.log('[Star Classifier] Background service worker started');

  // ─── Init alarms with error handling ───
  async function initAlarm() {
    try {
      const settings = await getSettings();
      if (settings.githubToken) {
        await browser.alarms.create('sync-stars', {
          periodInMinutes: settings.syncIntervalMinutes,
        });
        console.log(`[Star Classifier] Sync alarm set for every ${settings.syncIntervalMinutes} minutes`);
      }
    } catch (err) {
      console.error('[Star Classifier] Failed to init alarm:', err);
    }
  }
  initAlarm().catch((err) => console.error('[Star Classifier] initAlarm error:', err));

  // ─── Periodic sync ───
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'sync-stars') return;
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
  });

  // ─── Side panel: open on extension icon click ───
  // NOTE: action.onClicked only fires when there's NO default_popup in manifest.
  // When popup is set, clicking the icon opens popup instead.
  // The popup has a "Open Side Panel" button that sends a message here.
  browser.runtime.onMessage.addListener(async (message, sender) => {
    try {
      switch (message.type) {
        case 'SYNC_NOW': {
          const settings = await getSettings();
          if (!settings.githubToken) {
            return { ok: false, error: 'Token not configured' };
          }
          const result = await fullSync(settings.githubToken);
          return { ok: true, result };
        }

        case 'CHECK_STARRED': {
          const { repoId } = message;
          const repo = await db.repos.get(repoId);
          return { exists: !!repo, tags: repo?.tags ?? [] };
        }

        case 'ADD_TAG': {
          const { repoId, tags } = message;
          await addTagsToRepo(repoId, tags);
          return { ok: true };
        }

        case 'REMOVE_TAG': {
          const { repoId, tags } = message;
          await removeTagsFromRepo(repoId, tags);
          return { ok: true };
        }

        case 'GET_STATS': {
          const count = await db.repos.count();
          const newest = await db.repos.orderBy('lastSyncedAt').last();
          return { totalCount: count, lastSyncedAt: newest?.lastSyncedAt ?? null };
        }

        case 'CLEAR_BADGE': {
          await browser.action.setBadgeText({ text: '' });
          return { ok: true };
        }

        case 'OPEN_SIDE_PANEL': {
          // Open side panel from user gesture context (popup click)
          try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
              await (browser.sidePanel as any).open({ tabId: tab.id });
            }
            return { ok: true };
          } catch (err) {
            console.error('[Star Classifier] Side panel open failed:', err);
            return { ok: false, error: String(err) };
          }
        }

        default:
          return { ok: false, error: `Unknown message type: ${message.type}` };
      }
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
});
