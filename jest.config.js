/** @type {import('jest').Config} */

// ──────────────────────────────────────────────────────────────────
//  Configuração compartilhada entre os dois projetos Jest
// ──────────────────────────────────────────────────────────────────
const sharedConfig = {
  preset         : 'ts-jest',
  testEnvironment: 'node',
  setupFiles     : ['<rootDir>/test/setup-env.ts'],
  modulePathIgnorePatterns: ['<rootDir>/gen/'],
  moduleNameMapper: {
    '^#cds-models/(.*)$': '<rootDir>/@cds-models/$1',
    // TypeScript 7 removed the compiler API; ts-jest needs it.
    // Alias @typescript/typescript6 as 'typescript' so ts-jest finds it.
    '^typescript$': '@typescript/typescript6'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig    : './tsconfig.json',
        transpileOnly: true,
        diagnostics : false,
        isolatedModules: true
      }
    ]
  },
  testTimeout      : 30_000,
  verbose          : true,
  collectCoverageFrom: [
    'srv/**/*.ts',
    '!srv/types/**'
  ],
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches  : 70,
      functions : 80,
      lines     : 80,
      statements: 80
    }
  }
}

// ──────────────────────────────────────────────────────────────────
//  Projeto 1: suites principais (sem MTX plugin)
//
//  O moduleNameMapper substitui @sap/cds-mtxs pelo mock vazio
//  antes do cds.test() iniciar o servidor.  Isso evita que o plugin
//  MTX tente provisionar bancos por-tenant no boot in-memory.
//
//  Afeta: sales-order-service.test.ts e integration-service.test.ts
// ──────────────────────────────────────────────────────────────────
const mainProject = {
  ...sharedConfig,
  displayName : 'main',
  testMatch   : [
    '**/test/sales-order-service.test.ts',
    '**/test/integration-service.test.ts'
  ],
  moduleNameMapper: {
    ...sharedConfig.moduleNameMapper,
    '^@sap/cds-mtxs$'        : '<rootDir>/test/__mocks__/cds-mtxs-noop.js',
    '^@sap/cds-mtxs/(.*)$'   : '<rootDir>/test/__mocks__/cds-mtxs-noop.js',
    // O CAP resolve o plugin via require.resolve com caminho absoluto;
    // o moduleNameMapper do Jest intercepta o require após a resolução.
    // O padrão abaixo cobre o caminho absoluto em node_modules:
    '.*cds-mtxs.*cds-plugin.*': '<rootDir>/test/__mocks__/cds-mtxs-noop.js',
    '.*cds-mtxs.*'            : '<rootDir>/test/__mocks__/cds-mtxs-noop.js'
  }
}

// ──────────────────────────────────────────────────────────────────
//  Projeto 2: testes de multitenancy (carregam @sap/cds-mtxs real)
//
//  NÃO usa o mock — testa contexto de tenant, cds.env e padrões MTX
//  sem iniciar o servidor (sem cds.test()).
// ──────────────────────────────────────────────────────────────────
const mtxProject = {
  ...sharedConfig,
  displayName: 'multitenancy',
  testMatch  : ['**/test/multitenancy.test.ts']
}

// ──────────────────────────────────────────────────────────────────
//  Config raiz — usa `projects` para rodar ambos em paralelo
// ──────────────────────────────────────────────────────────────────
const config = {
  projects: [mainProject, mtxProject]
}

module.exports = config
