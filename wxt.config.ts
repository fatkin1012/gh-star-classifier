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
    version: '1.0.0',
    permissions: [
      'storage',
      'alarms',
    ],
    host_permissions: [
      'https://api.github.com/*',
      'https://github.com/*',
    ],
    action: {
      default_title: 'Star Classifier',
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
