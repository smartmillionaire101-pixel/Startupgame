import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'showcase', include: ['test/**/*.test.ts'] },
});
