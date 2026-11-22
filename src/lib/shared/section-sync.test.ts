import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVOLUTION_SECTION, isPageScopedSection } from './section-sync';

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});

/** A read of the Evolution document. */
const READS_EVOLUTION = /\bloadEvolutionDraft\.execute\b|\bloadEvolutionView\(/;
/** A load that re-runs when the Evolution document moves. */
const DECLARES_EVOLUTION = /sectionSyncKey\([^)]*(?:'evolution'|EVOLUTION_SECTION)\)/;
const serverImports = (text: string): string[] =>
	[...text.matchAll(/from '(?:\.\/|\$lib\/server\/)([\w.-]+)'/g)].map((m) => m[1].replace(/\.ts$/, ''));

/**
 * Loads that reach a module reading the Evolution document and need not re-run
 * when it moves, each with the reason. A new entry is a decision: say why.
 */
const NEED_NOT_FOLLOW: Readonly<Record<string, string>> = {
	'projects/[projectId]/+page.server.ts': 'it only redirects to the entry tab',
	// readFeaturePage names the request that created a feature: that moves only at the landing, which writes the features section.
	'projects/[projectId]/spec/features/[featureId]/+page.server.ts': 'the creating request changes only with the features section',
	'projects/[projectId]/spec/users/[userId]/+page.server.ts': 'the creating request changes only with the features section',
	// spec360-read reads the Evolution document in readFeaturePage alone, which these pages never call.
	'projects/[projectId]/spec/experience/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/features/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/glossary/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/tech/architecture/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/tech/data-map/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/tech/operations/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/tech/requirements/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/users/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document',
	'projects/[projectId]/spec/users/matrix/+page.server.ts': 'no reading of spec360-read it uses reads the Evolution document'
};

describe('the Evolution document and the live sync', () => {
	it('re-runs no project-wide aggregate: an act on a request is not a change of the specification', () => {
		expect(isPageScopedSection(EVOLUTION_SECTION)).toBe(true);
	});

	it('is followed by every page load that reads it', () => {
		const server = walk('src/lib/server').filter((f) => f.endsWith('.ts') && !/\.test\.|fixture/.test(f));
		const texts = new Map(server.map((f) => [basename(f, '.ts'), readFileSync(f, 'utf8')]));
		// The modules that read the document, directly or through another module of the request layer.
		const readers = new Set([...texts].filter(([, text]) => READS_EVOLUTION.test(text)).map(([name]) => name));
		for (let grew = true; grew; ) {
			grew = false;
			for (const [name, text] of texts)
				if (!readers.has(name) && serverImports(text).some((i) => readers.has(i))) {
					readers.add(name);
					grew = true;
				}
		}
		const loads = walk('src/routes').filter((f) => /\/\+(page|layout)(\.server)?\.ts$/.test(f) && !f.includes('/api/'));
		const unfollowed = loads
			.filter((file) => {
				const text = readFileSync(file, 'utf8');
				const reads = READS_EVOLUTION.test(text) || serverImports(text).some((i) => readers.has(i));
				return reads && !DECLARES_EVOLUTION.test(text);
			})
			.map((file) => file.replace(/^src\/routes\//, ''))
			.filter((route) => !(route in NEED_NOT_FOLLOW));
		expect(unfollowed).toEqual([]);
	});

	it('keeps no exemption for a load that no longer reads it or now follows it', () => {
		const stale = Object.keys(NEED_NOT_FOLLOW).filter((route) => {
			try {
				return DECLARES_EVOLUTION.test(readFileSync(join('src/routes', route), 'utf8'));
			} catch {
				return true;
			}
		});
		expect(stale).toEqual([]);
	});
});
