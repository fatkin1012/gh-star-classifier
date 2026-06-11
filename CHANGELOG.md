# Changelog — gh-star-classifier v1.2

## v1.2 (Batch AI + Improved Classification + UI)

### 1. `utils/types.ts` — New types for batch AI & confidence

- **`TaggedRepo.classificationConfidence`**: New optional `number` field (0-100) to store per-repo classification confidence.
- **`BatchClassificationResult`**: Interface for holistic AI analysis output (`assignments`, `proposedCategories`, `reclassifications`).
- **`RepoClassificationAssignment`**: Per-repo category suggestion with confidence.
- **`ProposedCategory`**: New category proposals with list of repos.
- **`ReclassificationSuggestion`**: Repos flagged for reclassification with reason.
- **`TopicCluster`**: Cluster of similar repos identified by AI.

### 2. `utils/classify.ts` — Expanded rules & improved scoring

- **Expanded CLASSIFY_RULES**: Added ~80 new keywords across all 5 categories:
  - `applications-tools`: bots, editors, notebooks, mobile apps, cross-platform
  - `libraries-frameworks`: agent-sdk, agent-framework, ai-sdk, ORM, auth, state-management, more
  - `awesome-lists-tutorials`: papers, research, blog posts, examples, workshops, curriculum
  - `scripts-dotfiles`: git-hooks, pre-commit, nix, terraform, k8s/helm, ansible
  - `boilerplates-starters`: create-* patterns, degit, monorepo templates, next.js starters
- **Added language matching to `libraries-frameworks`**: Python, JS, TS, Rust, Go, Java, etc. all add +2 score.
- **Improved confidence calculation**: Takes margin between top-2 category scores into account (bigger margin = higher confidence).
- **Added `getConfidenceColor(confidence)`** and **`getConfidenceLabel(confidence)`** helpers for UI.
- **Expanded sub-keywords** across all sub-categories.

### 3. `utils/batchAiClassifier.ts` — NEW Holistic batch AI classifier

- **`runBatchClassification(repos, config, onProgress)`**: Sends ALL repos to the LLM in a single holistic prompt. AI identifies:
  - Which repos belong in existing categories
  - Which repos need new categories (only when ≥3 repos share a theme)
  - Which repos are clearly miscategorized
- **`identifyTopicClusters(repos, config, onProgress)`**: AI analyzes all repos and identifies natural topic clusters. Filters to clusters with ≥3 repos to avoid tiny categories.
- **`applyBatchClassification(result)`**: Applies the AI's suggestions to the database.
- **`fullBatchAnalysis(config, onProgress)`**: One-shot pipeline — collect repos → identify clusters → run batch classification → apply to DB → return summary.
- Automatically chunks repos if too many (max 30 per chunk) and merges results.
- Includes comprehensive prompting with existing category definitions.

### 4. `utils/llm.ts` — Increased token limits

- **`callLlm` is now exported** (was private) so batchAiClassifier can use it.
- **Max tokens increased from 300 to 4000** for all providers (OpenAI, Anthropic, Ollama) to support batch analysis of multiple repos.

### 5. `utils/db.ts` — New helpers for reclassification

- **`updateRepoClassification(repoId, category, subCategory, confidence)`**: Updates a repo's classification metadata.
- **`getReposNeedingReclassification()`**: Returns repos that are uncategorized or have confidence < 40.
- **`reclassifyRepo(repoId)`**: Runs the rule engine on a single repo and updates its classification + confidence.

### 6. `utils/sync.ts` — Store confidence during sync

- Auto-classification now stores `classificationConfidence` alongside `category`/`subCategory`.
- LLM auto-classification loop now reclassifies each repo to get confidence for the `TaggedRepo` object.

### 7. UI Components

#### `components/RepoCard.tsx`
- **Confidence indicator**: Shows label (High/Medium/Low) + percentage after category badge.
- **Reclassify button**: One-click reclassification using the improved rule engine.
- Uses `getConfidenceColor()` for green/yellow/red color coding.

#### `entrypoints/sidepanel/SidePanelApp.tsx`
- **Smart Batch Analysis button**: New primary action (indigo colored) that runs `fullBatchAnalysis`.
- Shows batch results inline: summary, proposed new categories, reclassifications.
- **Per-repo reclassify button** on uncategorized repo badges.
- **Confidence percentage** shown next to category badges.
- RepoRow now accepts `onReclassify` callback.

#### `entrypoints/popup/App.tsx`
- **Smart Batch Analysis button**: Added before the existing AI Classify button.
- Batch analysis results shown via alert (popup space constraints).

#### `entrypoints/options/App.tsx`
- **Quality summary bar**: Shows well-classified vs low confidence vs uncategorized counts.
- Updated header to v1.2.

### Files modified:
| File | Change |
|------|--------|
| `utils/types.ts` | Added `classificationConfidence`, batch AI types |
| `utils/classify.ts` | Expanded rules ×2, better confidence, new exports |
| `utils/batchAiClassifier.ts` | **NEW** — holistic batch AI classifier |
| `utils/llm.ts` | Exported `callLlm`, increased max_tokens to 4000 |
| `utils/db.ts` | Added 3 reclassification helpers |
| `utils/sync.ts` | Stores confidence, fixed LLM loop classification |
| `components/RepoCard.tsx` | Confidence display + reclassify button |
| `entrypoints/sidepanel/SidePanelApp.tsx` | Batch analysis + confidence + reclassify |
| `entrypoints/popup/App.tsx` | Batch analysis button |
| `entrypoints/options/App.tsx` | Quality summary |

### Key design decisions:
1. **Holistic > per-repo**: Batch AI analyzes ALL repos together, identifying clusters and cross-repo patterns.
2. **≥3 threshold for new categories**: Prevents tiny meaningless categories.
3. **Conservative reclassification**: AI only reclassifies when confidence > 70% (prompt-level instruction).
4. **Confidence stored per-repo**: Persisted in IndexedDB and recalculated on every sync.
5. **Chunked batches**: Repos are chunked to avoid token limits; results are merged.
