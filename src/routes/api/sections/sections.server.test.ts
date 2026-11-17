import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conformanceOf, projectHealth } from '$domain/coherence';

/**
 * The coherence section an agent reads through the MCP (get_section coherence)
 * carries every reading the Control Center shows: the headline AND, beside it,
 * Proven against code (feat-control-center, criterion 6a0ee223). A measure the
 * page shows and the section withholds is a measure the agent will leave out of
 * its report, which is how "audit 100, coherence 77" got reported on a model
 * whose rules contradicted the code.
 */

const view = {
	draft: { projectId: 'linkding' },
	analysis: { dimensions: [], gaps: [], readinessScore: 93 },
	headline: { score: 77, verdict: 'strong', total: 13, blocking: 0, highSeverity: 0, weighsMost: [] }
};
let conformance: () => Promise<unknown>;
let health: () => unknown = () => projectHealth({ gaps: [], audit: [], codeLinked: false, features: [], openAnalyses: [{ featureId: 'f1', name: 'Slide', untraced: 2 }] });

vi.mock('$composition/container.server', () => ({
	getServices: () => ({
		sectionDocuments: { currentRevision: async () => 0 },
		draftLock: { current: async () => 0 },
		loadCoherenceDraft: { execute: async () => view },
		loadConformance: { execute: () => conformance() },
		readProjectHealth: { execute: async () => health() }
	})
}));
import { getServices } from '$composition/container.server';

vi.mock('$lib/server/project-access.server', () => ({
	requireProjectAccess: vi.fn(async () => {})
}));

const { GET } = await import('./+server');

type Event = Parameters<typeof GET>[0];
const read = async (section: string) => {
	const res = await GET({ locals: { services: getServices() }, url: new URL(`http://x/api/sections?projectId=linkding&section=${section}`) } as unknown as Event);
	return (await res.json()) as { draft: Record<string, unknown> };
};

describe('GET /api/sections?section=coherence', () => {
	beforeEach(() => {
		conformance = async () =>
			conformanceOf([{ found: 462, actions: { a1: { elements: [{ kind: 'action', location: { file: 'v.py', line: 1 } }] } }, criteria: { total: 21, verified: 0, failing: 0 } }]);
	});

	it('hands out Proven against code beside the headline, the analysis untouched', async () => {
		const { draft } = await read('coherence');
		expect(draft.headline).toEqual(view.headline);
		expect(draft.analysis).toEqual(view.analysis);
		expect(draft.conformance).toMatchObject({
			reading: 'measured',
			linked: true,
			percent: 0,
			label: '0% proven',
			actions: { proven: 0, located: 1 },
			criteria: { total: 21, verified: 0, failing: 0 },
			means: 'Share of modeled behavior proven by a passing run against the code; coherence and audit only prove the model is consistent.'
		});
	});

	it('hands out the one Project health and its points (criterion 7ae9b322)', async () => {
		const draft = (await read('coherence')).draft as { health: { blocking: number; pointsTotal: number; codeLinked: boolean; points: { title: string }[] } };
		expect(draft.health).toMatchObject({ blocking: 1, pointsTotal: 1, codeLinked: false });
		expect(draft.health.points[0].title).toBe('Analysis not finalized: Slide');
	});

	it('reads an unreadable measure as null, never as 0 %', async () => {
		conformance = async () => {
			throw new Error('coverage read failed');
		};
		const { draft } = await read('coherence');
		expect(draft.conformance).toBeNull();
		expect(draft.headline).toEqual(view.headline);
	});
});
