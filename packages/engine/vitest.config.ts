import { defineProject } from 'vitest/config';

export default defineProject({
  // Simulation-heavy tests (many settled months) are slow on a busy machine.
  test: { name: 'engine', include: ['test/**/*.test.ts'], testTimeout: 30_000 },
});
