import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  publicDir: process.env.WXT_ENHANCED === '1' ? 'public' : 'public-basic',
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: '拾藏 · 本地收藏工作台',
    short_name: '拾藏',
    description: '在设备本地整理小红书与抖音收藏，不上传正文和分析结果。',
    version: '0.1.0',
    minimum_chrome_version: '120',
    permissions: ['activeTab', 'scripting', 'storage'],
    action: {
      default_title: '拾藏：同步当前平台',
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data:; connect-src 'self';",
    },
  },
});
