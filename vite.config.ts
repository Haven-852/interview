import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mirrorApi } from './server/vitePlugin.mjs'

export default defineConfig({
  plugins: [react(), mirrorApi()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
})
