import { describe, expect, it } from 'vitest';
import { activityLog } from './activity-log';
import type { RetrospecRun } from './document';

const at = (min: number) => new Date(Date.UTC(2026, 9, 26, 10, min)).toISOString();
const run: RetrospecRun = {
	id: 'run-1',
	mode: 'repo',
	implicit: false,
	startedAt: at(0),
	startedBy: { id: 'ana@acme.io', name: 'Ana P.' },
	baseline: {},
	launchedAt: at(1),
	analysisEndedAt: null,
	analysisEndedBy: null,
	reviewStartedAt: null,
	itemTotal: 0,
	publishedAt: null,
	publishedBy: null,
	baselineId: null,
	verdicts: {}
};

describe('the activity log of a run', () => {
	it('tells the run, the LLM connecting, what it wrote and its final check, newest first', () => {
		const log = activityLog(
			run,
			[
				{ at: at(2), act: 'read', section: 'features' },
				{ at: at(3), act: 'write', section: 'data' },
				{ at: at(3), act: 'write', section: 'data' },
				{ at: at(4), act: 'write', section: 'foundation.identity' },
				{ at: at(20), act: 'read', section: null }
			],
			[{ performedAt: at(21), score: 82, blockingIssues: 2 }, { performedAt: '2026-10-25T10:00:00.000Z', score: 100, blockingIssues: 0 }]
		);
		expect(log.map((l) => l.text)).toEqual([
			'⚠ Final check: 2 blocking issues left (score 82)',
			'Your LLM is back on Lyriks',
			'Your LLM got the gist of the product',
			'Your LLM sketched the data model',
			'Your LLM plugged into Lyriks through the MCP',
			'The prompt was handed to your LLM',
			'Ana P. started the Reverse-Specification'
		]);
		expect(log[0].tone).toBe('warn');
	});

	it('keeps the calls made before the run started out of it', () => {
		const log = activityLog(run, [{ at: '2026-10-25T09:00:00.000Z', act: 'write', section: 'data' }], []);
		expect(log.map((l) => l.text)).toEqual(['The prompt was handed to your LLM', 'Ana P. started the Reverse-Specification']);
	});

	it('says a section once per burst, even when the LLM goes back and forth between two', () => {
		const log = activityLog(
			run,
			[
				{ at: at(2), act: 'write', section: 'features' },
				{ at: at(2), act: 'write', section: 'behavior' },
				{ at: at(2), act: 'write', section: 'features' },
				{ at: at(2), act: 'write', section: 'behavior' },
				{ at: at(4), act: 'write', section: 'features' }
			],
			[]
		);
		expect(log.filter((l) => l.text.startsWith('Your LLM ') && !l.text.includes('Lyriks')).map((l) => l.text)).toEqual([
			'Your LLM mapped the features',
			'Your LLM mapped the features',
			'Your LLM dug into what a feature does'
		]);
	});

	it('names what Lyriks detected, in its own tone, and leaves out what came before the run', () => {
		const log = activityLog(run, [], [], [
			{ at: at(5), kind: 'feature', names: ['Send a message'] },
			{ at: '2026-10-25T09:00:00.000Z', kind: 'table', names: ['User'] }
		]);
		expect(log[0]).toEqual({ at: at(5), text: 'Lyriks detected the feature “Send a message”', tone: 'found' });
		expect(log.some((l) => l.text.includes('User'))).toBe(false);
	});
});
