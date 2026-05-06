import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Aponta para a pasta correta dos testes
    include: ['__tests__/**/*.test.js'],
    // Setup carregado antes de cada suite
    setupFiles: ['./__tests__/setup.js'],
    // Processo isolado por arquivo para nao contaminar banco entre suites
    pool: 'forks',
    testTimeout: 10000,
    reporters: process.env.CI ? ['verbose'] : ['default'],
  }
})
