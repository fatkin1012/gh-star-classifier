# ⭐ GitHub Star Classifier

**Organize, tag, and filter your GitHub starred repos — right in your browser.**

A browser extension that syncs your GitHub stars, lets you tag them with custom labels, automatically classifies them using rules, and provides a clean UI to search and manage your ever-growing star list.

## Features

- **Sync stars** — Pull all your starred repos from GitHub with one click
- **Tag system** — Add/remove tags on any repo, search and filter by tag
- **Auto-classify rules** — Define rules (by language, topic, or keyword) to auto-tag new stars
- **Bulk tag** — Select multiple repos and tag them at once
- **GitHub page integration** — Tag UI injected into any GitHub repo page via content script
- **Search** — Search by repo name, description, language, or tags
- **Export/Import** — Backup and restore your tags as JSON
- **Background sync** — Auto-detects new stars and applies rules periodically

## Installation

### From source

```bash
pnpm install
pnpm build       # Chrome
pnpm build:firefox  # Firefox
```

Then load the extension:
- **Chrome**: `chrome://extensions` → Developer mode → Load unpacked → select `.output/chrome-mv3/`
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `.output/firefox-mv3/manifest.json`

### Prerequisites

You need a **GitHub Personal Access Token** (classic) with `repo` and `read:user` scopes:
1. Go to [GitHub Settings > Tokens](https://github.com/settings/tokens)
2. Generate a classic token with `repo` and `read:user` scopes
3. Paste it into the extension Settings page

## Usage

1. Click the extension icon → **Settings** tab → paste your GitHub token → **Save**
2. Go to the **Repos** tab → click **Sync** to fetch all your stars
3. Browse, search, and tag your repos
4. Define auto-classify rules in the Options page (right-click extension icon → Options)

## Tech Stack

- **Framework**: [WXT](https://wxt.dev) + React + TypeScript
- **UI**: Tailwind CSS + `react-icons`
- **Storage**: Dexie.js (IndexedDB)
- **GitHub API**: Octokit REST
- **Build**: Vite 8

## Development

```bash
pnpm dev          # Chrome dev mode with HMR
pnpm dev:firefox  # Firefox dev mode
pnpm compile      # TypeScript type check
pnpm zip          # Build production ZIP
```

## License

MIT
