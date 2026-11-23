import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';

const calls = vi.hoisted(() => [] as string[]);
const read = (name: string) => vi.fn(async (_services: unknown, projectId: string) => {
	calls.push(`${name}:${projectId}`);
	if (name === 'glossary' && projectId === 'broken') throw new Error('unreadable');
});

vi.mock('./behavior-read.server', () => ({ readBehavior: read('behaviour') }));
vi.mock('./spec-elements.server', () => ({ readSpecElements: read('elements') }));
vi.mock('./spec360-read.server', () => ({ readSpecFrame: read('frame'), readGlossary: read('glossary') }));
vi.mock('./spec360-overview.server', () => ({ readOverview: read('overview') }));
vi.mock('./spec-validation.server', () => ({ readSpecValidationSources: read('validation') }));
vi.mock('./spec360-sources.server', () => ({ readSpecSources: read('sources') }));
vi.mock('./landed-changes.server', () => ({ readLandedChanges: read('landed') }));
vi.mock('./retrospec-page.server', () => ({ loadRetrospecFigures: read('reverse') }));
vi.mock('./project-activity.server', () => ({ projectRetrospecActivity: read('bar:reverse'), projectDiscussions: read('bar:discussions') }));

const { warmUp, warmUpEnabled, WARM_UP_PROJECTS } = await import('./startup-warm-up.server');

function services(recent: string[] | null) {
	const recentlyWritten = vi.fn(async (limit: number) => (recent ?? []).slice(0, limit));
	return {
		fake: {
			sectionDocuments: recent === null ? {} : { recentlyWritten },
			listProjects: { execute: async () => (recent === null ? [] : [{ id: 'other' }, ...recent.map((id) => ({ id }))]) },
			loadCoherenceDraft: { execute: async (projectId: string) => void calls.push(`coherence:${projectId}`) },
			projectHealthView: { get: async (projectId: string) => void calls.push(`health:${projectId}`) },
			implementationCoverage: { get: async (projectId: string) => void calls.push(`coverage:${projectId}`) }
		} as unknown as AppServices,
		recentlyWritten
	};
}

describe('warmUp', () => {
	it('reads ahead every first-page reading of the projects written last, one project after the other', async () => {
		calls.length = 0;
		const { fake, recentlyWritten } = services(['last', 'before']);
		const lines: string[] = [];

		const result = await warmUp(fake, { log: (line) => lines.push(line) });

		expect(recentlyWritten).toHaveBeenCalledWith(WARM_UP_PROJECTS);
		expect(result.projects).toEqual(['last', 'before']);
		expect(calls.slice(0, 24).filter((c) => c.endsWith(':last'))).toHaveLength(12);
		// The project written last is read whole before the next one starts.
		expect(calls.findIndex((c) => c.endsWith(':before'))).toBe(12);
		expect(calls[0]).toBe('behaviour:last');
		// The analysis every project page's layout reads comes right after the behaviour it folds.
		expect(calls[1]).toBe('coherence:last');
		// Then what the bar reads of every project, after the heavy readings.
		expect(calls.slice(24)).toEqual(['bar:reverse:other', 'bar:discussions:other', 'bar:reverse:last', 'bar:discussions:last', 'bar:reverse:before', 'bar:discussions:before']);
		expect(lines[0]).toMatch(/^\[warm-up\] read ahead last, before and the bar of 3 projects in \d+ms$/);
	});

	it('goes on past a reading that fails and counts it', async () => {
		calls.length = 0;
		const { fake } = services(['broken']);
		const result = await warmUp(fake);
		expect(result.failed).toBe(1);
		expect(calls).toContain('coverage:broken');
	});

	it('reads nothing ahead when the store cannot tell which projects were written last', async () => {
		calls.length = 0;
		const result = await warmUp(services(null).fake);
		expect(result.projects).toEqual([]);
		expect(calls).toEqual([]);
	});
});

describe('warmUpEnabled', () => {
	it('is on unless LYRIKS_WARM_UP is 0', () => {
		expect(warmUpEnabled(undefined)).toBe(true);
		expect(warmUpEnabled('1')).toBe(true);
		expect(warmUpEnabled(' 0 ')).toBe(false);
	});
});
