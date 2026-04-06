import { defineConfig } from 'vite'

export default defineConfig({
  // Expose on all interfaces so iPhone on the same WiFi can reach it
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
})
