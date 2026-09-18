import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/loadEnv.ts'],
    // RLS tests hit the live Supabase project over the network and create/confirm
    // real (disposable) auth users — keep them serialized and give them room.
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
