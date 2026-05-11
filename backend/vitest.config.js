import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.js'],
    // setupFiles removido: cada suite de integracao gerencia seu proprio banco
    // Os testes unitarios existentes nao dependem do setup global
    pool: 'forks',
    poolOptions: { forks: { isolate: true } },
    testTimeout: 15000,
    reporters: process.env.CI ? ['verbose'] : ['default'],
  }
})
