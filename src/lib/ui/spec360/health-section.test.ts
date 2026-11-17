import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from '../../../routes/projects/[projectId]/spec/tech/health/+page.server';
import { TECH_TABS } from './spec-nav';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const health = source('../../../routes/projects/[projectId]/spec/noticed/+page.svelte');
const operations = source('../../../routes/projects/[projectId]/spec/tech/operations/+page.svelte');

describe('Health opens on the project score, then every point that weighs on it [criterion:4dadd4b8]', () => {
	it('titles the page Health and draws the tile above the points', () => {
		expect(health).toContain('title="Health"');
		expect(health.indexOf('<FigureTile')).toBeGreaterThan(-1);
		expect(health.indexOf('<FigureTile')).toBeLessThan(health.indexOf('title="Every point"'));
	});
});

describe('Operations draws where the product runs, and holds no score of its own [criterion:8a696e52]', () => {
	it('reads the environments, the targets and the code, without the project score', () => {
		expect(operations).toContain('aria-label="Operations"');
		expect(operations.indexOf('title="Environments"')).toBeLessThan(operations.indexOf('title="Operations"'));
		expect(operations).not.toContain('FigureTile');
		expect(operations).not.toContain('Project health');
	});
});

describe('the sections read one Health, and the view of Technology & data reads Operations [criterion:097c4079]', () => {
	it('names the view Operations and no view Health', () => {
		expect(TECH_TABS.map((t) => t.label)).toContain('Operations');
		expect(TECH_TABS.map((t) => t.label)).not.toContain('Health');
	});
});

describe('the old address of the view opens Operations [criterion:84162c34]', () => {
	it('sends the browser for good, keeping what the address asked', () => {
		try {
			load({ params: { projectId: 'p 1' }, url: new URL('https://x.test/old?a=1') } as never);
			expect.unreachable();
		} catch (thrown) {
			expect(thrown).toMatchObject({ status: 308, location: '/projects/p%201/spec/tech/operations?a=1' });
		}
	});
});
