import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Full-match simulations here run far more actions per test than the sibling projects
    // (a Spades hand is a whole 13-17-trick play-through) — the default 5s timeout is too
    // tight for those.
    testTimeout: 60000,
  },
});
