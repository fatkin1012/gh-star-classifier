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

const CLASSIFY_RULES: Record<string, ClassifyWeights> = {
  'applications-tools': {
    strong: [
      'cli', 'cli-app', 'desktop', 'desktop-app', 'electron',
      'tui', 'gui', 'game', 'games', 'gaming', 'game-engine',
      'app', 'application', 'webapp', 'web-app', 'pwa',
      'vscode', 'vscode-extension', 'chrome-extension',
      'firefox-addon', 'browser-extension', 'extension',
      'terminal', 'terminal-app', 'native-app',
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
    ],
    weak: [
      '-app', '-tool', '-cli', '-desktop',
    ],
    languages: [],
    anti: [
      'library for', 'framework for', 'sdk for',
      'awesome', 'awesome-list', 'template', 'starter',
      'boilerplate', 'dotfiles', 'my config',
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
    ],
    weak: [
      'react-', 'vue-', 'ngx-', 'svelte-', 'solid-',
      'use-', '-hooks', '-utils', '-lib', '-sdk',
    ],
    languages: [],
    anti: [
      'awesome', 'template', 'starter', 'boilerplate',
      'game', 'desktop app', 'cli tool',
    ],
  },
  'boilerplates-starters': {
    strong: [
      'template', 'boilerplate', 'starter', 'starter-kit',
      'starter-template', 'scaffold', 'scaffolding',
      'cookiecutter', 'create-app', 'yeoman', 'generator',
      'project-template', 'repo-template',
    ],
    medium: [
      'template for', 'starter kit', 'starter template',
      'boilerplate for', 'scaffolding for',
      'a template', 'a starter', 'a boilerplate',
      'get started', 'quick start', 'getting started',
      'minimal template', 'opinionated template',
      'my personal template', 'project scaffold',
    ],
    weak: [
      '-template', '-starter', '-boilerplate',
      'template-', 'starter-',
    ],
    languages: [],
    anti: [
      'awesome', 'library', 'framework', 'sdk',
      'game', 'component library',
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
    ],
    weak: [
      'awesome-', '-resources', '-notes',
      '-roadmap', '-cheatsheet',
    ],
    languages: [],
    anti: [
      'library for', 'framework for', 'sdk for',
      'template for', 'boilerplate', 'electron app',
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
    ],
    weak: [
      '-dotfiles', '.dotfiles', '-config',
      '-workflow', '-script', '-macro',
    ],
    languages: [
      'shell', 'batchfile', 'powershell', 'dockerfile',
      'makefile', 'vba', 'visual basic',
    ],
    anti: [
      'library for', 'framework for', 'awesome',
      'game', 'template', 'boilerplate',
      'tutorial', 'react component',
    ],
  },
};

// ─────── 評分引擎 ───────

interface ClassificationResult {
  category: string;      // 主分類 key
  subCategory: string;   // 子分類 key（可以為空）
  confidence: number;    // 置信度 0-100
}

/**
 * 對一個 repo 進行分類
 */
export function classifyRepo(repo: {
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
  const subScores: Record<string, Record<string, number>> = {};

  for (const [catKey, rule] of Object.entries(CLASSIFY_RULES)) {
    let score = 0;

    // topics 強匹配 → +3 each (exact match)
    // weak partial match → +1 each (substring overlap, but not exact)
    for (const topic of topics) {
      if (rule.strong.includes(topic)) {
        score += 3;
      } else {
        // Only try partial match when exact match didn't hit.
        // This avoids double-counting (e.g. topic "cli" matching
        // both exact and partial on the same keyword).
        for (const kw of rule.strong) {
          if (topic.includes(kw) || kw.includes(topic)) {
            score += 1;
            break;
          }
        }
      }
    }

    // description 中匹配 → +2 each
    for (const kw of rule.medium) {
      if (desc.includes(kw)) {
        score += 2;
      }
    }

    // name 弱匹配 → +1 each
    for (const kw of rule.weak) {
      if (name.includes(kw) || fullName.includes(kw)) {
        score += 1;
      }
    }

    // 語言匹配 → +2
    if (rule.languages.length > 0 && lang) {
      if (rule.languages.includes(lang)) {
        score += 2;
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

  for (const [catKey, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = catKey;
    }
  }

  // 如果最高分 <= 0，算未分類
  if (bestScore <= 0) {
    return { category: 'uncategorized', subCategory: '', confidence: 0 };
  }

  // 找最匹配的子分類
  const subCat = findBestSubCategory(bestCat, { name, desc, topics, lang });
  const confidence = Math.min(100, Math.round((bestScore / 15) * 100));

  return {
    category: bestCat,
    subCategory: subCat,
    confidence,
  };
}

/**
 * 在子分類中找到最匹配的
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
    'cli-tool': ['cli', 'command', 'terminal', 'command-line', 'commandline'],
    'desktop-app': ['desktop', 'electron', 'tauri', 'native', 'winforms', 'wpf', 'qt'],
    'web-app': ['webapp', 'web-app', 'web app', 'pwa', 'full-stack', 'fullstack', 'dashboard', 'spa'],
    'game': ['game', 'gaming', 'game-engine', 'playable', 'godot', 'unity', 'unreal', 'phaser'],
    'dev-tool': ['dev-tool', 'developer tool', 'debugger', 'profiler', 'linter', 'formatter', 'bundler', 'compiler'],
    'browser-ext': ['extension', 'chrome extension', 'browser extension', 'firefox addon'],

    'npm-package': ['npm', 'npm package', 'npm-package'],
    'react-component': ['react', 'react-component', 'react component', 'jsx', 'tsx'],
    'ui-library': ['ui', 'component library', 'design system', 'ui-kit', 'ui kit'],
    'utility': ['utility', 'util', 'helper', 'tiny', 'micro'],
    'sdk-wrapper': ['sdk', 'api', 'client', 'wrapper'],
    'plugin': ['plugin', 'vite-plugin', 'rollup-plugin', 'webpack-plugin', 'eslint-plugin', 'tailwind-plugin', 'postcss-plugin'],
    'framework': ['framework', 'opinionated', 'full-featured'],

    'web-template': ['web', 'next.js', 'react', 'vue', 'svelte', 'frontend'],
    'backend-template': ['backend', 'server', 'api', 'express', 'fastapi', 'django', 'spring'],
    'fullstack-template': ['fullstack', 'full-stack', 'full stack', 'next.js'],
    'config-template': ['config', 'monorepo', 'typescript', '.github', 'gitignore'],
    'starter-kit': ['starter-kit', 'starter kit', 'get started'],

    'awesome-list': ['awesome', 'awesome-list'],
    'interview-qa': ['interview', 'interview-questions', 'coding-interview', 'leetcode'],
    'learning-notes': ['notes', 'learning', 'study', 'learn'],
    'documentation': ['doc', 'docs', 'documentation', 'wiki'],
    'course-tutorial': ['tutorial', 'course', 'guide', 'how-to'],

    'shell-script': ['shell', 'bash', 'zsh', 'shell script'],
    'github-action': ['action', 'workflow', 'ci', 'github action'],
    'docker-config': ['docker', 'dockerfile', 'docker-compose', 'container'],
    'dotfiles': ['dotfiles', 'dotfile'],
    'vba-macro': ['vba', 'macro', 'excel', 'office'],
    'ci-cd': ['ci/cd', 'cicd', 'continuous integration', 'deploy'],
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
export function batchClassify(
  repos: Array<{
    name: string;
    fullName: string;
    description: string;
    language: string;
    topics: string[];
  }>
): Map<string, ClassificationResult> {
  const results = new Map<string, ClassificationResult>();
  for (const repo of repos) {
    results.set(repo.fullName, classifyRepo(repo));
  }
  return results;
}
