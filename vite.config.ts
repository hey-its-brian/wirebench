import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileApi } from './server/fileApi.ts'

export default defineConfig({
  plugins: [react(), fileApi()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Saving a project writes into data/; that must not reload the page.
    watch: { ignored: ['**/data/**', '**/art/**', '**/docs/**'] },
  },
  preview: { host: '127.0.0.1' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
