import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Roda cada arquivo de teste em processo isolado
    // para evitar que um teste contamine o banco do próximo
    pool: 'forks',
    // Carrega o setup antes de qualquer suite
    setupFiles: ['./src/__tests__/setup.js'],
    // Timeout generoso para operações de banco in-memory
    testTimeout: 10000,
    // Reporters limpos no CI
    reporters: process.env.CI ? ['verbose'] : ['default'],
  }
})
