import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'GitHub Star Classifier',
    description: 'Organize, tag, and classify your GitHub starred repos',
    version: '1.5.0',
    action: {
      default_title: 'Star Classifier',
    },
    permissions: [
      'storage',
      'alarms',
      'tabs',
    ],
    host_permissions: [
      'https://api.github.com/*',
      'https://github.com/*',
    ],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ['injected.css'],
        matches: ['https://github.com/*'],
      },
    ],
  },
});
