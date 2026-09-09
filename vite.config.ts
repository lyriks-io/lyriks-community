import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { autoCompanions } from './vite/auto-companions';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), autoCompanions()],
	build: {
		// On-prem opacity: the appliance ships this build to a customer who can open
		// the image. Minify (esbuild, the prod default made explicit) mangles the
		// client and SSR bundles, and sourcemap:false emits NO *.js.map so the
		// original Svelte/TypeScript cannot be reconstructed from the shipped code.
		// The Dockerfile also strips any stray *.map as a belt-and-suspenders guard.
		minify: 'esbuild',
		sourcemap: false
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
