// ============================================================
// Content Script — Injected UI on GitHub pages
// ============================================================

import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['*://github.com/*'],
  runAt: 'document_idle',

  main() {
    console.log('[Star Classifier] Content script loaded');

    // --- Helper: inject tag UI next to the star button ---
    function injectTagUI() {
      // Look for the star/unstar button area
      const starContainer = document.querySelector('form[aria-label="Star"]')?.closest('div') ||
                            document.querySelector('[data-hydro-click*="star_button"]')?.closest('div') ||
                            document.querySelector('.starring-container');

      if (!starContainer) return;

      // Avoid duplicate injection
      if (starContainer.querySelector('.gh-sc-tag-btn')) return;

      // Create our tag button
      const tagBtn = document.createElement('button');
      tagBtn.className = 'gh-sc-tag-btn btn btn-sm ml-2';
      tagBtn.innerHTML = '🏷️ Tags';

      // Get repo info from page
      const repoFullName = getRepoFullName();
      const repoId = getRepoId();

      if (!repoFullName || !repoId) {
        tagBtn.title = 'Could not detect repository';
        tagBtn.disabled = true;
      } else {
        tagBtn.title = 'Manage tags for this repo';
        tagBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await showTagPopup(repoId, repoFullName);
        });
      }

      starContainer.parentElement?.insertBefore(tagBtn, starContainer.nextSibling);
    }

    function getRepoFullName(): string | null {
      const meta = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]');
      if (meta) return meta.getAttribute('content');
      // Fallback: parse from URL
      const match = window.location.pathname.match(/^([^/]+\/[^/]+)/);
      return match ? match[1] : null;
    }

    function getRepoId(): number | null {
      const meta = document.querySelector('meta[name="octolytics-dimension-repository_id"]');
      if (meta) return Number(meta.getAttribute('content'));
      return null;
    }

    // --- Tag popup overlay ---
    async function showTagPopup(repoId: number, repoFullName: string) {
      // Remove existing popup if any
      document.querySelector('.gh-sc-popup')?.remove();

      // Get current tags from background
      const resp = await browser.runtime.sendMessage({ type: 'CHECK_STARRED', repoId });
      const currentTags: string[] = resp?.tags ?? [];

      const overlay = document.createElement('div');
      overlay.className = 'gh-sc-popup';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.4); z-index: 999999;
        display: flex; align-items: center; justify-content: center;
      `;

      const popup = document.createElement('div');
      popup.style.cssText = `
        background: white; border-radius: 8px; padding: 20px;
        max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      `;

      popup.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;font-size:16px;font-weight:600;">🏷️ Tags for ${repoFullName}</h3>
          <button id="gh-sc-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">&times;</button>
        </div>
        <div id="gh-sc-tags-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;min-height:28px;">
          ${currentTags.length === 0 ? '<span style="color:#999;font-size:13px;">No tags yet</span>' : ''}
          ${currentTags.map(t => `<span class="gh-sc-tag" data-tag="${t}" style="display:inline-flex;align-items:center;gap:4px;background:#e8f0fe;color:#1a56db;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:500;">${t} <span class="gh-sc-tag-remove" style="cursor:pointer;opacity:0.6;font-size:14px;">&times;</span></span>`).join('')}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="gh-sc-tag-input" type="text" placeholder="Add a tag..." style="flex:1;padding:6px 10px;border:1px solid #d0d7de;border-radius:6px;font-size:13px;" />
          <button id="gh-sc-tag-add" style="background:#1a56db;color:white;border:none;border-radius:6px;padding:6px 14px;font-size:13px;font-weight:500;cursor:pointer;">Add</button>
        </div>
        <p style="font-size:11px;color:#999;margin-top:8px;">Tags are synced to Star Classifier extension</p>
      `;

      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      // Event handlers
      const close = () => overlay.remove();
      overlay.querySelector('#gh-sc-close')!.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      const input = overlay.querySelector('#gh-sc-tag-input') as HTMLInputElement;
      const addBtn = overlay.querySelector('#gh-sc-tag-add') as HTMLButtonElement;
      const tagsList = overlay.querySelector('#gh-sc-tags-list') as HTMLDivElement;

      const addTag = async () => {
        const tag = input.value.trim();
        if (!tag) return;
        // Send to background to store
        await browser.runtime.sendMessage({
          type: 'ADD_TAG',
          repoId,
          tags: [tag],
        });
        // Update UI
        const emptyMsg = tagsList.querySelector('span[style*="color:#999"]');
        if (emptyMsg) emptyMsg.remove();
        const tagEl = document.createElement('span');
        tagEl.className = 'gh-sc-tag';
        tagEl.dataset.tag = tag;
        tagEl.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:#e8f0fe;color:#1a56db;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:500;';
        tagEl.innerHTML = `${tag} <span class="gh-sc-tag-remove" style="cursor:pointer;opacity:0.6;font-size:14px;">&times;</span>`;
        tagEl.querySelector('.gh-sc-tag-remove')!.addEventListener('click', async () => {
          await browser.runtime.sendMessage({
            type: 'REMOVE_TAG',
            repoId,
            tags: [tag],
          });
          tagEl.remove();
          if (tagsList.children.length === 0) {
            tagsList.innerHTML = '<span style="color:#999;font-size:13px;">No tags yet</span>';
          }
        });
        tagsList.appendChild(tagEl);
        input.value = '';
      };

      addBtn.addEventListener('click', addTag);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTag(); });

      // Remove handlers on existing tags
      overlay.querySelectorAll('.gh-sc-tag-remove').forEach((el) => {
        el.addEventListener('click', async () => {
          const tagEl = el.closest('.gh-sc-tag') as HTMLElement;
          const tag = tagEl.dataset.tag!;
          await browser.runtime.sendMessage({
            type: 'REMOVE_TAG',
            repoId,
            tags: [tag],
          });
          tagEl.remove();
          if (tagsList.children.length === 0) {
            tagsList.innerHTML = '<span style="color:#999;font-size:13px;">No tags yet</span>';
          }
        });
      });
    }

    // --- MutationObserver to handle GitHub SPA navigation ---
    const observer = new MutationObserver(() => {
      if (window.location.pathname.split('/').length >= 3) {
        const existed = document.querySelector('.gh-sc-tag-btn');
        if (!existed) injectTagUI();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial injection
    setTimeout(injectTagUI, 2000);

    // Also listen for popstate (GitHub uses history pushState)
    window.addEventListener('popstate', () => {
      setTimeout(injectTagUI, 1000);
    });
  },
});
