import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './', // relative asset paths → works from file:// inside the APK
  // Single self-contained index.html (JS + CSS inlined): Android WebView refuses
  // to fetch external ES-module scripts over file://, so nothing may be external.
  plugins: [react(), viteSingleFile()],
  build: {
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
