import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.js', '../services/print-agent/__tests__/**/*.test.js'],
    pool: 'forks',
    testTimeout: 15000,
    reporters: process.env.CI ? ['verbose'] : ['default'],
  }
})
