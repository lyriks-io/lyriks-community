import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest, type EvolutionRequest } from './draft';
import { askedWalks, dueReadings } from './automatic-readings';

/**
 * What the platform computes on its own, so nobody clicks for a reading with
 * nothing to choose. What these tests pin is ac-evo-imp-7, ac-evo-coh-8 and
 * ac-evo-impl-9.
 */

const at = (stage: EvolutionRequest['stage'], overrides: Partial<EvolutionRequest> = {}) =>
	createEvolutionRequest({ id: 'r1', title: 'Note', origin: 'internal_idea', stage, ...overrides });
const change = (recordedAt: string) => ({
	id: recordedAt,
	type: 'draft_change' as const,
	summary: 'Drafted',
	authorId: 'ana',
	authorKind: 'person' as const,
	recordedAt,
	proposalId: null,
	acceptedByPersonId: null,
	supersededById: null,
	channel: 'page' as const
});

describe('the readings the platform computes on its own', () => {
	it('runs the impact and the coherence check at the Impact analysis when they never ran or the drafts changed since', () => {
		const drafted = { drafts: [createDraftLeaf({ kind: 'add', name: 'Text' }), createDraftLeaf({ kind: 'amend', baseLeafId: 'feat-order' })] };
		expect(dueReadings(at('coherence', drafted))).toEqual({ impact: ['add', 'change'], report: false });

		const read = {
			...drafted,
			history: [change('2026-10-08T09:00:00.000Z')],
			impactReport: { status: 'ready' as const, hypothesis: 'add' as const, depth: 2, ranAt: '2026-10-08T10:00:00.000Z' },
			coherenceReport: { status: 'ready' as const, projectScore: 70, requestDelta: 0, ranAt: '2026-10-08T10:00:00.000Z' }
		};
		expect(dueReadings(at('coherence', read))).toEqual({ impact: [], report: false });
		expect(dueReadings(at('coherence', { ...read, history: [change('2026-10-08T11:00:00.000Z')] })).impact).toEqual(['add', 'change']);
	});

	it('builds the report at Build when there is none, and never before the freeze nor once the request is closed', () => {
		expect(dueReadings(at('implementation'))).toEqual({ impact: [], report: true });
		expect(dueReadings(at('specification'))).toEqual({ impact: [], report: false });
		expect(dueReadings(at('implementation', { status: 'closed' }))).toEqual({ impact: [], report: false });

		// A report built against version 2 is due again once version 3 is frozen.
		const line = { id: 'l1', iteration: 1, specVersion: 2, verdict: 'missing', decision: 'undecided' } as unknown as EvolutionRequest['implementationFindings'][number];
		expect(dueReadings(at('implementation', { specVersion: 3, iteration: 1, implementationFindings: [line] })).report).toBe(true);
		expect(dueReadings(at('implementation', { specVersion: 2, iteration: 1, implementationFindings: [line] })).report).toBe(false);
	});

	it('asks for a change walk when the request drafts nothing', () => {
		expect(askedWalks({ drafts: [] })).toEqual(['change']);
	});
});
