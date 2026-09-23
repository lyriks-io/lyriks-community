import { describe, it, expect } from 'vitest';
import { componentsReport, type ComponentVersion } from './components';

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
	},
	{
		id: 'host-machine',
		name: 'Machine',
		origin: 'host',
		version: '8 cores, 16 GB',
		status: 'recorded',
		detail: 'Read on the host at the last install or update.',
		build: { taken: '2026-09-20' }
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

	it('carries the machine, which the screen folds away', () => {
		// The fold is a reading choice on screen; what support receives never
		// depends on it, so the report is the whole panel or it is nothing.
		const report = componentsReport(components);
		expect(report).toContain('Machine: 8 cores, 16 GB (recorded)');
		expect(report).toContain('  taken: 2026-09-20');
	});
});
