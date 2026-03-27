import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ops/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@ops/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
      '@ops/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
      '@ops/queue': path.resolve(__dirname, 'packages/queue/src/index.ts'),
      '@ops/runtime': path.resolve(__dirname, 'packages/runtime/src/index.ts'),
      '@ops/memory': path.resolve(__dirname, 'packages/memory/src/index.ts'),
      '@ops/skills': path.resolve(__dirname, 'packages/skills/src/index.ts'),
      '@ops/observability': path.resolve(__dirname, 'packages/observability/src/index.ts')
    }
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/**/*.test.ts', 'dashboard/src/**/*.test.ts?(x)'],
    environment: 'node',
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage'
    }
  }
});
