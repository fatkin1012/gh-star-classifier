/**
 * 分類模組 — 5 大類 + 子分類 AI 分類引擎
 *
 * 分類策略：
 * 1. 優先檢查 GitHub topics（最可靠的信號）
 * 2. 其次檢查 description 中的關鍵詞
 * 3. 然後檢查 repo name
 * 4. 最後看語言作為輔助判斷
 *
 * 每個主分類有強關鍵詞（得分高）和弱關鍵詞（得分低），
 * 得分最高的類別即為分類結果。
 */

// ─────── 類別定義 ───────

export interface SubCategory {
  key: string;
  label: string;
}

export interface Category {
  key: string;
  label: string;
  labelEn: string;
  icon: string;
  subCategories: SubCategory[];
}

export const CATEGORIES: Category[] = [
  {
    key: 'applications-tools',
    label: '應用程序 / 獨立工具',
    labelEn: 'Applications & Tools',
    icon: '🖥️',
    subCategories: [
      { key: 'cli-tool', label: 'CLI 工具' },
      { key: 'desktop-app', label: '桌面應用' },
      { key: 'web-app', label: 'Web 應用' },
      { key: 'game', label: '遊戲' },
      { key: 'dev-tool', label: '開發工具' },
      { key: 'browser-ext', label: '瀏覽器擴展' },
    ],
  },
  {
    key: 'libraries-frameworks',
    label: '模組 / 插件 / 庫',
    labelEn: 'Libraries & Frameworks',
    icon: '📦',
    subCategories: [
      { key: 'npm-package', label: 'npm 包' },
      { key: 'react-component', label: 'React 組件' },
      { key: 'ui-library', label: 'UI 庫' },
      { key: 'utility', label: '工具庫' },
      { key: 'sdk-wrapper', label: 'SDK / API 封裝' },
      { key: 'plugin', label: '插件' },
      { key: 'framework', label: '框架' },
    ],
  },
  {
    key: 'boilerplates-starters',
    label: '模板 / 腳手架',
    labelEn: 'Boilerplates & Starters',
    icon: '🚀',
    subCategories: [
      { key: 'web-template', label: 'Web 模板' },
      { key: 'backend-template', label: '後端模板' },
      { key: 'fullstack-template', label: '全棧模板' },
      { key: 'config-template', label: '配置模板' },
      { key: 'starter-kit', label: '入門套件' },
    ],
  },
  {
    key: 'awesome-lists-tutorials',
    label: '資源彙整 / 學習資料',
    labelEn: 'Awesome Lists & Tutorials',
    icon: '📚',
    subCategories: [
      { key: 'awesome-list', label: 'Awesome 系列' },
      { key: 'interview-qa', label: '面試題庫' },
      { key: 'learning-notes', label: '學習筆記' },
      { key: 'documentation', label: '文檔' },
      { key: 'course-tutorial', label: '教程 / 課程' },
    ],
  },
  {
    key: 'scripts-dotfiles',
    label: '自動化腳本 / 配置',
    labelEn: 'Scripts & Dotfiles',
    icon: '⚙️',
    subCategories: [
      { key: 'shell-script', label: 'Shell 腳本' },
      { key: 'github-action', label: 'GitHub Actions' },
      { key: 'docker-config', label: 'Docker 配置' },
      { key: 'dotfiles', label: 'Dotfiles' },
      { key: 'vba-macro', label: 'VBA / 巨集' },
      { key: 'ci-cd', label: 'CI/CD 配置' },
    ],
  },
];

export const CATEGORY_MAP = new Map<string, Category>();
for (const c of CATEGORIES) {
  CATEGORY_MAP.set(c.key, c);
  for (const sub of c.subCategories) {
    CATEGORY_MAP.set(sub.key, c);
  }
}

// ─────── 分類關鍵詞定義 ───────

interface ClassifyWeights {
  strong: string[];    // topics 命中 → +3
  medium: string[];    // description 中出現 → +2
  weak: string[];      // name 中出現 → +1
  languages: string[]; // 語言匹配 → +2
  anti: string[];      // 反匹配 → -3 (避免誤分)
}

// v1.2: Expanded keyword lists for better classification accuracy
const CLASSIFY_RULES: Record<string, ClassifyWeights> = {
  'applications-tools': {
    strong: [
      'cli', 'cli-app', 'desktop', 'desktop-app', 'electron',
      'tui', 'gui', 'game', 'games', 'gaming', 'game-engine',
      'app', 'application', 'webapp', 'web-app', 'pwa',
      'vscode', 'vscode-extension', 'chrome-extension',
      'firefox-addon', 'browser-extension', 'extension',
      'terminal', 'terminal-app', 'native-app',
      'notebook', 'jupyter', 'dashboard', 'platform',
      'cms', 'blog', 'forum', 'chat', 'social',
      'e-commerce', 'shop', 'marketplace', 'website',
      'landing-page', 'portfolio', 'resume', 'cv',
      'slides', 'presentation',
      'notebook', 'jupyter', 'jupyter-notebook',
      'ide', 'editor', 'code-editor',
      'applet', 'webview', 'tauri',
      'electron-app', 'tauri-app',
      'macos-app', 'ios-app', 'android-app',
      'windows-app', 'cross-platform-app',
      'discord-bot', 'telegram-bot', 'slack-bot',
      'bot', 'chatbot',

    ],
    medium: [
      'desktop application', 'native application', 'cross-platform',
      'a terminal', 'a cli', 'a gui', 'a desktop app',
      'electron app', 'built with electron', 'tauri app',
      'command line', 'command-line', 'commandline',
      'visual studio code extension', 'vs code extension',
      'chrome extension', 'browser extension',
      'a tool for', 'tool that', 'utility that',
      'a game', 'game engine', 'playable',
      'a platform for', 'a dashboard for', 'a website for',
      'a simple tool', 'a small utility',
      'a mac app', 'a windows app', 'a mobile app',
      'runs on', 'cross platform',
      'slack bot', 'discord bot', 'telegram bot',
      'text editor', 'code editor',
      'notebook interface',
      'a convenient', 'an easy-to-use',
      'tool for managing', 'tool to help',
      'a modern', 'lightweight editor',

    ],
    weak: [
      '-app', '-tool', '-cli', '-desktop',
      '-bot', '-editor', '-viewer',
      '-player', '-browser', '-manager',
    ],
    languages: [
      'jupyter notebook', 'html', 'css',
    ],
    anti: [
      'library for', 'framework for', 'sdk for',
      'awesome', 'awesome-list', 'template', 'starter',
      'boilerplate', 'dotfiles', 'my config',
      'component library', 'ui components',
      'a collection of', 'collection of',
    ],
  },
  'libraries-frameworks': {
    strong: [
      'library', 'lib', 'sdk', 'framework', 'npm-package', 'npm',
      'pypi', 'pypi-package', 'nuget', 'cargo', 'rubygem',
      'composer', 'packagist', 'maven', 'gradle',
      'react-component', 'vue-component', 'ui-component',
      'component-library', 'ui-library', 'hooks', 'hook',
      'middleware', 'adapter', 'wrapper', 'provider',
      'api-wrapper', 'api-client', 'api-client-library',
      'react-native', 'tailwind-plugin', 'postcss-plugin',
      'rollup-plugin', 'vite-plugin', 'webpack-plugin',
      'eslint-plugin', 'stylelint-plugin',
      'sdk', 'rest-client', 'graphql-client',
      'validator', 'parser', 'serializer', 'converter',
      'transpiler', 'compiler', 'polyfill', 'shim',
      'typings', 'types', 'definitelytyped', 'declaration',
      'agent-sdk', 'agent-framework', 'agent-library',
      'llm-sdk', 'llm-framework', 'ai-sdk',
      'state-management', 'state-manager',
      'router', 'routing', 'http-client',
      'orm', 'odm', 'database-driver',
      'validation', 'validator', 'serializer',
      'testing', 'test-utils', 'test-framework',
      'auth', 'authentication', 'oauth',
      'type-safe', 'type-safe',
      'data-fetching', 'state-manager',

    ],
    medium: [
      'a react component', 'a vue component',
      'a library for', 'library for',
      'a framework', 'framework for',
      'sdk for', 'api wrapper for', 'wrapper library',
      'component library', 'ui components',
      'a set of', 'collection of', 'a collection of',
      'npm package', 'open source library',
      'node.js library', 'python library',
      'typescript library', 'javascript library',
      'react hook', 'custom hook',
      'tailwindcss plugin',
      'a lightweight', 'a minimal', 'a fast',
      'a simple', 'a modern',
      'zero-dependency', 'no dependencies', 'written in',
      'a pure python library', 'a go library',
      'a rust library', 'a java library',
      'package for', 'module for',
      'provides a', 'simple wrapper',
      'client library', 'api client',
      'state management', 'state container',
      'type definitions', 'typings for',
      'a small library', 'a lightweight library',
      'a zero-dependency', 'tiny library',
      'drop-in replacement',

    ],
    weak: [
      'react-', 'vue-', 'ngx-', 'svelte-', 'solid-',
      'use-', '-hooks', '-utils', '-lib', '-sdk',
      '-core', '-base', '-common', '-shared',
      '-client', '-provider', '-adapter',
      '-orm', '-driver', '-middleware',
    ],
    languages: [
      'python', 'javascript', 'typescript', 'rust',
      'go', 'java', 'kotlin', 'swift', 'ruby', 'php',
      'c#', 'csharp', 'f#', 'fsharp', 'scala', 'elixir',
      'haskell', 'clojure', 'dart', 'zig', 'nim',

    ],
    anti: [
      'awesome', 'template', 'starter', 'boilerplate',
      'game', 'desktop app', 'cli tool',
      'tutorial', 'guide', 'my notes',
    ],
  },
  'boilerplates-starters': {
    strong: [
      'template', 'boilerplate', 'starter', 'starter-kit',
      'starter-template', 'scaffold', 'scaffolding',
      'cookiecutter', 'create-app', 'yeoman', 'generator',
      'project-template', 'repo-template',
      'example', 'demo', 'sample', 'playground',
      'sandbox', 'seed', 'seed-project',
      'create-', 'degit', 'template-repo',

    ],
    medium: [
      'template for', 'starter kit', 'starter template',
      'boilerplate for', 'scaffolding for',
      'a template', 'a starter', 'a boilerplate',
      'get started', 'quick start', 'getting started',
      'minimal template', 'opinionated template',
      'my personal template', 'project scaffold',
      'example project', 'demo app', 'sample code',
      'reference implementation',
      'starting point for', 'kickstart',
      'monorepo template', 'typescript starter',
      'next.js starter', 'react starter',

    ],
    weak: [
      '-template', '-starter', '-boilerplate',
      'template-', 'starter-',
      '-example', '-demo', '-sample',
      'create-', 'create',

    ],
    languages: [],
    anti: [
      'awesome', 'library', 'framework', 'sdk',
      'game', 'component library',
      'dotfiles', 'configuration',
    ],
  },
  'awesome-lists-tutorials': {
    strong: [
      'awesome', 'awesome-list', 'awesome-lists',
      'tutorial', 'tutorials', 'tutorial-series',
      'learn', 'learning', 'learn-', 'learning-',
      'resources', 'resource-list', 'curated-list',
      'cheatsheet', 'cheat-sheet', 'cheat sheet',
      'roadmap', 'interview', 'interview-questions',
      'interview-prep', 'coding-interview',
      'notes', 'study', 'study-notes',
      'book', 'books', 'ebook', 'free-programming-books',
      'course', 'courses', 'course-notes',
      'guide', 'guides', 'how-to', 'howto',
      'awesome-for', 'list-of', 'lists',
      'curated', 'handbook', 'playbook',
      'compilation', 'digest',
      'paper', 'papers', 'research',
      'blog', 'blog-post', 'article',
      'examples', 'example-code', 'samples',
      'workshop', 'workshops', 'hands-on',
      'curriculum', 'syllabus',

    ],
    medium: [
      'a curated list', 'curated list of', 'awesome list of',
      'list of awesome', 'a list of',
      'collection of resources', 'learning resources',
      'learning path', 'learn how to',
      'interview preparation', 'interview questions',
      'study notes', 'my notes on',
      'tutorial for beginners', 'step by step',
      'a guide to', 'the ultimate guide',
      'how to learn', 'from scratch',
      'weekly', 'newsletter', 'blog post',
      'article', 'paper', 'research', 'survey',
      'overview of',
      'list of resources', 'curated resources',
      'examples of', 'code examples for',
      'practical guide', 'comprehensive guide',
      'collection of awesome',

    ],
    weak: [
      'awesome-', '-resources', '-notes',
      '-roadmap', '-cheatsheet',
      '-guide', '-tutorial', '-examples',
    ],
    languages: [],
    anti: [
      'library for', 'framework for', 'sdk for',
      'template for', 'boilerplate', 'electron app',
      'component library', 'ui kit',
    ],
  },
  'scripts-dotfiles': {
    strong: [
      'dotfiles', 'dotfile', 'dot-file',
      'github-action', 'github-actions', 'action',
      'dockerfile', 'docker-image', 'docker-compose',
      'vba', 'vba-macro', 'excel-vba', 'office-vba',
      'macro', 'macros', 'vba-script',
      'oh-my-zsh', 'zsh-plugin', 'bash-it',
      'homebrew', 'homebrew-formula',
      'devcontainer', 'dev-container',
      'vscode', 'vscode-settings', 'vimrc', 'nvim',
      'neovim', 'tmux', 'alacritty', 'kitty',
      'wezterm', 'hyper', 'terminal-emulator',
      'iterm', 'iterm2',
      'git-hooks', 'husky', 'commitlint',
      'pre-commit', 'lint-staged',
      'nix', 'nixos', 'nix-darwin',
      'ansible', 'ansible-role',
      'terraform', 'pulumi', 'iac',
      'k8s', 'kubernetes', 'helm',
      'cloudformation', 'cdk',

    ],
    medium: [
      'my dotfiles', 'my config', 'my configuration',
      'github action', 'workflow', 'ci/cd',
      'personal config', 'config files',
      'automation script', 'bash script',
      'shell script', 'powershell script',
      'docker setup', 'docker compose',
      'vba macro for', 'excel macro',
      'development environment', 'dev environment',
      'setup script', 'install script',
      'oh my zsh', 'zsh config', 'bash config',
      'my vim config', 'vscode settings',
      'editor config', 'theme for',
      'color scheme', 'colorscheme',
      'git hooks', 'pre-commit hooks',
      'infrastructure as code',
      'deployment script', 'provisioning',

    ],
    weak: [
      '-dotfiles', '.dotfiles', '-config',
      '-workflow', '-script', '-macro',
      '-hook', '-hooks',
    ],
    languages: [
      'shell', 'batchfile', 'powershell', 'dockerfile',
      'makefile', 'vba', 'visual basic',
      'vim script', 'viml', 'vim', 'lua',
      'hcl', 'terraform', 'nix',

    ],
    anti: [
      'library for', 'framework for', 'awesome',
      'game', 'template', 'boilerplate',
      'tutorial', 'react component',
    ],
  },
};

// ─────── 評分引擎 ───────

export interface ClassificationResult {
  category: string;      // 主分類 key
  subCategory: string;   // 子分類 key（可以為空）
  confidence: number;    // 置信度 0-100
}

/**
 * Optional AI classifier callback for classifyRepo.
 * Should return category + subCategory + tags, or null to fallback to rule-based.
 * 對一個 repo 進行分類
 * v1.2: Improved scoring with better scale and confidence calculation

 */
export type AiClassifier = (repo: {
  name: string;
  fullName: string;
  description: string;
  language: string;
  topics: string[];
}) => Promise<{ category: string; subCategory: string; tags?: string[] } | null>;

/**
 * Language → category fallback map.
 * Used as a last resort when rule-based scoring yields score <= 0.
 * Returns with very low confidence (5) to indicate "guess, not classification".
 */
const LANGUAGE_CATEGORY_FALLBACK: Record<string, string> = {
  'python': 'libraries-frameworks',
  'javascript': 'libraries-frameworks',
  'typescript': 'libraries-frameworks',
  'rust': 'libraries-frameworks',
  'go': 'libraries-frameworks',
  'java': 'libraries-frameworks',
  'kotlin': 'libraries-frameworks',
  'swift': 'libraries-frameworks',
  'ruby': 'libraries-frameworks',
  'c': 'libraries-frameworks',
  'c++': 'libraries-frameworks',
  'c#': 'libraries-frameworks',
  'php': 'libraries-frameworks',
  'shell': 'scripts-dotfiles',
  'batchfile': 'scripts-dotfiles',
  'powershell': 'scripts-dotfiles',
  'dockerfile': 'scripts-dotfiles',
  'makefile': 'scripts-dotfiles',
  'vim script': 'scripts-dotfiles',
  'viml': 'scripts-dotfiles',
  'jupyter notebook': 'applications-tools',
  'html': 'applications-tools',
  'css': 'applications-tools',
};

/**
 * Synchronous rule-based classification (v1.4+: internal fallback).
 * Used by classifyRepo when AI is unavailable.
 */
export function classifyRepoSync(repo: {
  name: string;
  fullName: string;
  description: string;
  language: string;
  topics: string[];
}): ClassificationResult {
  const name = repo.name?.toLowerCase() || '';
  const fullName = repo.fullName?.toLowerCase() || '';
  const desc = repo.description?.toLowerCase() || '';
  const lang = repo.language?.toLowerCase() || '';
  const topics = (repo.topics || []).map((t) => t.toLowerCase());

  const scores: Record<string, number> = {};

  for (const [catKey, rule] of Object.entries(CLASSIFY_RULES)) {
    let score = 0;
    let matchCount = 0;

    // topics 強匹配 → +3 each (exact match)
    // weak partial match → +1 each (substring overlap)
    for (const topic of topics) {
      if (rule.strong.includes(topic)) {
        score += 3;
        matchCount++;
      } else {
        for (const kw of rule.strong) {
          if (topic.includes(kw) || kw.includes(topic)) {
            score += 1;
            matchCount++;
            break;
          }
        }
      }
    }

    // description 中匹配 → +2 each
    for (const kw of rule.medium) {
      if (desc.includes(kw)) {
        score += 2;
        matchCount++;
      }
    }

    // name 弱匹配 → +1 each
    for (const kw of rule.weak) {
      if (name.includes(kw) || fullName.includes(kw)) {
        score += 1;
        matchCount++;
      }
    }

    // 語言匹配 → +2 (only if the language is indicative of a library)
    if (rule.languages.length > 0 && lang) {
      if (rule.languages.includes(lang)) {
        score += 2;
        matchCount++;
      }
    }

    // 反匹配 → -3 each（支持 substring 匹配 topics）
    for (const kw of rule.anti) {
      if (desc.includes(kw) || topics.some((t) => t.includes(kw) || kw.includes(t))) {
        score -= 3;
      }
    }

    scores[catKey] = score;
  }

  // 找最高分
  let bestCat = 'uncategorized';
  let bestScore = -999;
  let secondBestScore = -999;

  for (const [catKey, score] of Object.entries(scores)) {
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestCat = catKey;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  // 如果最高分 <= 0，試 language fallback
  if (bestScore <= 0) {
    const fallbackCat = LANGUAGE_CATEGORY_FALLBACK[lang];
    if (fallbackCat) {
      return {
        category: fallbackCat,
        subCategory: '',
        confidence: 5, // very low confidence — this is a guess
      };
    }
    return { category: 'uncategorized', subCategory: '', confidence: 0 };
  }

  // Calculate confidence based on score magnitude and margin over second-best
  // Max theoretical score varies; use a sigmoid-like scale
  const margin = bestScore - secondBestScore;
  const rawConfidence = Math.min(100, Math.round((bestScore / 20) * 100));

  // Boost confidence when there's a clear margin over second place
  let confidence = rawConfidence;
  if (margin >= 5) confidence = Math.min(100, rawConfidence + 15);
  if (margin >= 10) confidence = Math.min(100, rawConfidence + 25);

  // 找最匹配的子分類
  const subCat = findBestSubCategory(bestCat, { name, desc, topics, lang });

  return {
    category: bestCat,
    subCategory: subCat,
    confidence,
  };
}

/**
 * Async classification with AI override (v1.4).
 * If aiClassifier is provided and succeeds, its result overrides the rule-based result.
 * Falls back to rule-based when AI is unavailable, fails, or returns uncategorized.
 */
export async function classifyRepo(
  repo: {
    name: string;
    fullName: string;
    description: string;
    language: string;
    topics: string[];
  },
  aiClassifier?: AiClassifier | null,
): Promise<ClassificationResult & { tags?: string[] }> {
  // Try AI first
  if (aiClassifier) {
    try {
      const aiResult = await aiClassifier(repo);
      if (aiResult && aiResult.category && aiResult.category !== 'uncategorized') {
        return {
          category: aiResult.category,
          subCategory: aiResult.subCategory || '',
          confidence: 85,
          tags: aiResult.tags || [],
        };
      }
    } catch (err) {
      console.warn('[Classify] AI classification failed, falling back to rules:', err instanceof Error ? err.message : err);
    }
  }

  // Fallback to rule-based classification
  const syncResult = classifyRepoSync(repo);
  return {
    category: syncResult.category,
    subCategory: syncResult.subCategory,
    confidence: syncResult.confidence,
    tags: [],
  };
}

/**
 * 在子分類中找到最匹配的
 * v1.2: Expanded sub-keywords
 */
function findBestSubCategory(
  category: string,
  repo: { name: string; desc: string; topics: string[]; lang: string }
): string {
  const cat = CATEGORY_MAP.get(category);
  if (!cat || cat.subCategories.length === 0) return '';

  const { name, desc, topics, lang } = repo;

  // 對每個子分類定義一些關鍵詞
  const subKeywords: Record<string, string[]> = {
    'cli-tool': ['cli', 'command', 'terminal', 'command-line', 'commandline', 'tui'],
    'desktop-app': ['desktop', 'electron', 'tauri', 'native', 'winforms', 'wpf', 'qt', 'macos', 'windows-app'],
    'web-app': ['webapp', 'web-app', 'web app', 'pwa', 'full-stack', 'fullstack', 'dashboard', 'spa', 'web-application'],
    'game': ['game', 'gaming', 'game-engine', 'playable', 'godot', 'unity', 'unreal', 'phaser', 'pixel'],
    'dev-tool': ['dev-tool', 'developer tool', 'debugger', 'profiler', 'linter', 'formatter', 'bundler', 'compiler', 'build-tool'],
    'browser-ext': ['extension', 'chrome extension', 'browser extension', 'firefox addon', 'webextension'],

    'npm-package': ['npm', 'npm package', 'npm-package', 'npm-pkg'],
    'react-component': ['react', 'react-component', 'react component', 'jsx', 'tsx', 'react-hook'],
    'ui-library': ['ui', 'component library', 'design system', 'ui-kit', 'ui kit', 'components'],
    'utility': ['utility', 'util', 'helper', 'tiny', 'micro', 'mini', 'lightweight'],
    'sdk-wrapper': ['sdk', 'api', 'client', 'wrapper', 'sdk-wrapper'],
    'plugin': ['plugin', 'vite-plugin', 'rollup-plugin', 'webpack-plugin', 'eslint-plugin', 'tailwind-plugin', 'postcss-plugin', 'prettier-plugin'],
    'framework': ['framework', 'opinionated', 'full-featured', 'meta-framework'],

    'web-template': ['web', 'next.js', 'react', 'vue', 'svelte', 'frontend', 'web-template'],
    'backend-template': ['backend', 'server', 'api', 'express', 'fastapi', 'django', 'spring', 'backend-template'],
    'fullstack-template': ['fullstack', 'full-stack', 'full stack', 'next.js', 'remix'],
    'config-template': ['config', 'monorepo', 'typescript', '.github', 'gitignore', 'eslint-config', 'tsconfig'],
    'starter-kit': ['starter-kit', 'starter kit', 'get started', 'kickstart'],

    'awesome-list': ['awesome', 'awesome-list', 'awesome-list'],
    'interview-qa': ['interview', 'interview-questions', 'coding-interview', 'leetcode', 'interview-prep'],
    'learning-notes': ['notes', 'learning', 'study', 'learn', 'my-notes', 'study-notes'],
    'documentation': ['doc', 'docs', 'documentation', 'wiki', 'docsify', 'docusaurus'],
    'course-tutorial': ['tutorial', 'course', 'guide', 'how-to', 'workshop', 'hands-on'],

    'shell-script': ['shell', 'bash', 'zsh', 'shell script', 'bash-script'],
    'github-action': ['action', 'workflow', 'ci', 'github action', 'composite-action'],
    'docker-config': ['docker', 'dockerfile', 'docker-compose', 'container', 'docker-image'],
    'dotfiles': ['dotfiles', 'dotfile', 'dot-file'],
    'vba-macro': ['vba', 'macro', 'excel', 'office', 'vba-macro'],
    'ci-cd': ['ci/cd', 'cicd', 'continuous integration', 'deploy', 'ci-cd'],
  };

  const scores: Record<string, number> = {};
  for (const sub of cat.subCategories) {
    let score = 0;
    const kws = subKeywords[sub.key] || [];

    for (const kw of kws) {
      if (topics.includes(kw)) score += 3;
      if (desc.includes(kw)) score += 2;
      if (name.includes(kw)) score += 1;
    }

    scores[sub.key] = score;
  }

  let bestSub = '';
  let bestScore = 0;
  for (const [key, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestSub = key;
    }
  }

  return bestSub;
}

/**
 * Confidence color for UI display
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 70) return 'text-green-600';
  if (confidence >= 40) return 'text-yellow-600';
  return 'text-red-500';
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 70) return 'High';
  if (confidence >= 40) return 'Medium';
  return 'Low';
}

/**
 * 獲取主分類的顯示資訊
 */
export function getCategoryInfo(categoryKey: string): {
  key: string;
  label: string;
  labelEn: string;
  icon: string;
} | null {
  const cat = CATEGORY_MAP.get(categoryKey);
  if (!cat) return null;
  return {
    key: cat.key,
    label: cat.label,
    labelEn: cat.labelEn,
    icon: cat.icon,
  };
}

/**
 * 獲取子分類的顯示標籤
 */
export function getSubCategoryLabel(categoryKey: string, subKey: string): string | null {
  const cat = CATEGORY_MAP.get(categoryKey);
  if (!cat) return null;
  const sub = cat.subCategories.find((s) => s.key === subKey);
  return sub?.label || null;
}

/**
 * 批量分類多個 repo（同步時調用）
 */
export async function batchClassify(
  repos: Array<{
    name: string;
    fullName: string;
    description: string;
    language: string;
    topics: string[];
  }>,
  aiClassifier?: AiClassifier | null,
): Promise<Map<string, ClassificationResult & { tags?: string[] }>> {
  const results = new Map<string, ClassificationResult & { tags?: string[] }>();
  for (const repo of repos) {
    results.set(repo.fullName, await classifyRepo(repo, aiClassifier));
  }
  return results;
}

// ─────── Dynamic category icon helpers ───────

/**
 * Rough topic → icon mapping for auto-generated dynamic categories.
 */
const TOPIC_ICON_MAP: Record<string, string> = {
  'ai': '🤖',
  'machine-learning': '🤖',
  'deep-learning': '🧠',
  'llm': '🧠',
  'gpt': '🧠',
  'data': '📊',
  'database': '🗄️',
  'big-data': '📊',
  'security': '🔒',
  'privacy': '🔒',
  'crypto': '🔐',
  'blockchain': '🔗',
  'cloud': '☁️',
  'devops': '☁️',
  'infrastructure': '☁️',
  'network': '🌐',
  'web': '🌐',
  'http': '🌐',
  'api': '🔌',
  'mobile': '📱',
  'ios': '📱',
  'android': '📱',
  'flutter': '📱',
  'react-native': '📱',
  'design': '🎨',
  'ui': '🎨',
  'ux': '🎨',
  'figma': '🎨',
  'css': '🎨',
  'audio': '🎵',
  'music': '🎵',
  'video': '🎬',
  'media': '🎬',
  'image': '🖼️',
  '3d': '🧊',
  'gaming': '🎮',
  'game': '🎮',
  'math': '🔢',
  'science': '🔬',
  'physics': '⚛️',
  'bio': '🧬',
  'finance': '💰',
  'testing': '🧪',
  'test': '🧪',
  'documentation': '📖',
  'docs': '📖',
  'hardware': '🖥️',
  'embedded': '🖥️',
  'iot': '📡',
  'robot': '🤖',
  'cli': '💻',
  'terminal': '💻',
  'productivity': '✅',
  'workflow': '⚡',
};

/**
 * Get a rough emoji icon for a set of topics.
 * Checks signature topics first, falls back to first topic.
 */
export function getIconForTopics(topics: string[]): string {
  for (const topic of topics) {
    const lower = topic.toLowerCase();
    if (TOPIC_ICON_MAP[lower]) return TOPIC_ICON_MAP[lower];
    // Check partial matches for compound topics
    for (const [key, icon] of Object.entries(TOPIC_ICON_MAP)) {
      if (lower.includes(key) || key.includes(lower)) return icon;
    }
  }
  return '📁'; // default
}
