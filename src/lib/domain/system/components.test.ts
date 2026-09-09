import { describe, it, expect } from 'vitest';
import { componentsDigest, componentsReport, type ComponentVersion } from './components';

const components: ComponentVersion[] = [
	{
		id: 'platform',
		name: 'Lyriks platform',
		origin: 'lyriks',
		version: '0.9.9',
		status: 'running',
		detail: 'This very process.',
		build: { commit: 'abc1234', built: '2026-08-01' }
	},
	{
		id: 'back',
		name: 'Lyriks back',
		origin: 'lyriks',
		version: null,
		status: 'not-configured',
		detail: 'Optional and not wired in this install.'
	}
];

describe('componentsReport', () => {
	it('carries version, status, detail and every build fact', () => {
		const report = componentsReport(components);
		expect(report).toContain('Lyriks platform: 0.9.9 (running)');
		expect(report).toContain('  This very process.');
		expect(report).toContain('  commit: abc1234');
		expect(report).toContain('  built: 2026-08-01');
		expect(report).toContain('Lyriks back: not configured (not configured)');
	});

	it('says strictly more than the digest', () => {
		expect(componentsReport(components).length).toBeGreaterThan(componentsDigest(components).length);
	});
});
