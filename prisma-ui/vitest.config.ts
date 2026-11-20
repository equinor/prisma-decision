import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: ['./src/test/setup.ts'],
		// Keep concurrent jsdom/EDS renders from starving interaction tests of CPU time.
		maxWorkers: 2,
		// Fail a hung test or hook instead of stalling the run.
		testTimeout: 20_000,
		hookTimeout: 20_000,
		teardownTimeout: 10_000,
	},
});
