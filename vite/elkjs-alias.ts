import { fileURLToPath } from 'node:url';

/**
 * Points the one elkjs module mermaid 12 imports (in its lazily loaded ELK
 * layout chunk) at vite/elkjs-excluded.js. The app build and the browser test
 * fixtures both use it, so neither needs elkjs, which the package override in
 * package.json keeps out of node_modules.
 */
export const elkjsExcluded = {
	find: 'elkjs/lib/elk.bundled.js',
	replacement: fileURLToPath(new URL('./elkjs-excluded.js', import.meta.url))
};
