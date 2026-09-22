import { describe, expect, it } from 'vitest';
import { SaveCoherenceDraftUseCase } from './save-coherence-draft';
import { parseCoherenceDraft } from '../parse-coherence-draft';
import { createEmptyCoherenceDraft, type GapDecision, type ProjectCoherenceDraft } from '$domain/coherence';
import type {
	ClockPort,
	CoherenceDraftRepositoryPort,
	GlobalCoherenceCheckerPort,
	SectionDraftSaveOptions,
	TelemetryPort
} from '../ports';

/**
 * One register, two doors.
 *
 * The decide button refused what the section accepted. `POST .../coherence/
 * decisions` checks that the caller is a person, that the finding is open and
 * not blocking, and that a reason was given; `PUT /api/draft/coherence` took
 * `decisions` and `acknowledgedGapIds` as plain data, author kind included. So
 * anything that can write the section, an MCP client included, could settle
 * every non-blocking finding, sign it as a person, and move the score. These
 * tests hold both doors to the same guard.
 */

const decision = (gapId: string): GapDecision => ({
	id: `decision-${gapId}`,
	gapId,
	status: 'accepted_risk',
	reason: 'weighed and owned',
	authorId: 'someone@example.com',
	authorKind: 'person',
	decidedAt: '2026-09-22T09:00:00.000Z',
	gapTitle: `finding ${gapId}`,
	supersededById: null
});

class FakeRepo implements CoherenceDraftRepositoryPort {
	saved: ProjectCoherenceDraft | null = null;
	constructor(private readonly stored: ProjectCoherenceDraft | null) {}
	async load() {
		return this.stored;
	}
	async save(draft: ProjectCoherenceDraft) {
		this.saved = draft;
		return 1;
	}
	async currentRevision() {
		return 1;
	}
}

const checker: GlobalCoherenceCheckerPort = {
	analyze: async () => ({ dimensions: [], gaps: [], readinessScore: 0 })
};
const clock: ClockPort = { nowIso: () => '2026-09-22T10:00:00.000Z' };
const telemetry: TelemetryPort = { emit: () => {} };

const useCaseOver = (stored: ProjectCoherenceDraft | null) => {
	const repo = new FakeRepo(stored);
	return { repo, useCase: new SaveCoherenceDraftUseCase(repo, checker, clock, telemetry) };
};

/** No revision expectation and no client header: the save options of a plain call. */
const anySave: SectionDraftSaveOptions = { expectedRevision: null, origin: null };
const aPerson = { id: 'ana@example.com', kind: 'person' as const };

const withDecisions = (projectId: string, gapIds: string[]): ProjectCoherenceDraft => ({
	...createEmptyCoherenceDraft(projectId),
	decisions: gapIds.map(decision)
});

describe('the section write is not a way to settle a finding', () => {
	it('drops the decisions a payload carries and keeps the stored trace', async () => {
		const { repo, useCase } = useCaseOver(withDecisions('p1', ['real-one']));
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), decisions: [decision('smuggled')] },
			anySave,
			aPerson
		);
		expect(repo.saved?.decisions.map((d) => d.gapId)).toEqual(['real-one']);
	});

	it('drops acknowledgements too: they settle a finding just as surely', async () => {
		const stored = { ...createEmptyCoherenceDraft('p1'), acknowledgedGapIds: ['old-legacy'] };
		const { repo, useCase } = useCaseOver(stored);
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), acknowledgedGapIds: ['a', 'b', 'c'] },
			anySave,
			aPerson
		);
		expect(repo.saved?.acknowledgedGapIds).toEqual(['old-legacy']);
	});

	it('still saves the authored state the section is actually for', async () => {
		const { repo, useCase } = useCaseOver(null);
		await useCase.execute({ ...createEmptyCoherenceDraft('p1'), threshold: 77 }, anySave, aPerson);
		expect(repo.saved?.threshold).toBe(77);
	});

	it('never erases a trace just because the payload carried none', async () => {
		const { repo, useCase } = useCaseOver(withDecisions('p1', ['kept']));
		await useCase.execute(createEmptyCoherenceDraft('p1'), anySave, aPerson);
		expect(repo.saved?.decisions).toHaveLength(1);
	});

	it('keeps what the decisions endpoint hands over: it already asked who is deciding', async () => {
		const { repo, useCase } = useCaseOver(createEmptyCoherenceDraft('p1'));
		await useCase.executeDecided(withDecisions('p1', ['just-decided']), anySave);
		expect(repo.saved?.decisions.map((d) => d.gapId)).toEqual(['just-decided']);
	});
});

describe('the payload parser', () => {
	it('reads no decision and no acknowledgement, whatever the body says', () => {
		const parsed = parseCoherenceDraft(
			{
				projectId: 'p1',
				threshold: 80,
				decisions: [{ ...decision('smuggled'), authorKind: 'person' }],
				acknowledgedGapIds: ['one', 'two']
			},
			'p1'
		);
		expect(parsed.decisions).toEqual([]);
		expect(parsed.acknowledgedGapIds).toEqual([]);
		expect(parsed.threshold).toBe(80);
	});
});

describe('a decision prepared for somebody to take', () => {
	const prep = (gapId: string, reason = 'faithful to the source, on purpose') => ({
		id: `prepared-${gapId}`,
		gapId,
		gapTitle: `finding ${gapId}`,
		status: 'by_design' as const,
		reason,
		preparedById: '',
		preparedByKind: 'ai_client' as const,
		preparedAt: ''
	});
	const aClient = { id: 'claude', kind: 'ai_client' as const };
	const openGap = (id: string, blocking = false) => ({
		id,
		severity: 'low' as const,
		title: `finding ${id}`,
		detail: '',
		sourceStep: 'rules',
		blocking,
		provenance: 'declared' as const
	});
	const over = (stored: ProjectCoherenceDraft | null, gaps: ReturnType<typeof openGap>[]) => {
		const repo = new FakeRepo(stored);
		const seeing: GlobalCoherenceCheckerPort = {
			analyze: async () => ({ dimensions: [], gaps, readinessScore: 0 })
		};
		return { repo, useCase: new SaveCoherenceDraftUseCase(repo, seeing, clock, telemetry) };
	};

	it('stamps who prepared it, from the request and never from the payload', async () => {
		const { repo, useCase } = over(createEmptyCoherenceDraft('p1'), [openGap('g1')]);
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), prepared: [prep('g1')] },
			anySave,
			aClient
		);
		expect(repo.saved?.prepared[0]).toMatchObject({
			gapId: 'g1',
			preparedById: 'claude',
			preparedByKind: 'ai_client',
			preparedAt: '2026-09-22T10:00:00.000Z'
		});
	});

	it('settles nothing: the finding is still open and nothing is acknowledged', async () => {
		const { repo, useCase } = over(createEmptyCoherenceDraft('p1'), [openGap('g1')]);
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), prepared: [prep('g1')] },
			anySave,
			aClient
		);
		expect(repo.saved?.decisions).toEqual([]);
		expect(repo.saved?.acknowledgedGapIds).toEqual([]);
	});

	it('drops one whose finding is blocking: the answer there is a fix', async () => {
		const { repo, useCase } = over(createEmptyCoherenceDraft('p1'), [openGap('g1', true)]);
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), prepared: [prep('g1')] },
			anySave,
			aClient
		);
		expect(repo.saved?.prepared).toEqual([]);
	});

	it('drops one whose finding is gone, rather than leave a card nobody can act on', async () => {
		const { repo, useCase } = over(createEmptyCoherenceDraft('p1'), []);
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), prepared: [prep('g1')] },
			anySave,
			aClient
		);
		expect(repo.saved?.prepared).toEqual([]);
	});

	it('keeps the original author while the preparation itself is unchanged', async () => {
		const stored: ProjectCoherenceDraft = {
			...createEmptyCoherenceDraft('p1'),
			prepared: [
				{ ...prep('g1'), preparedById: 'claude', preparedByKind: 'ai_client', preparedAt: 'yesterday' }
			]
		};
		const { repo, useCase } = over(stored, [openGap('g1')]);
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), prepared: [prep('g1')] },
			anySave,
			{ id: 'ana@example.com', kind: 'person' }
		);
		expect(repo.saved?.prepared[0].preparedById).toBe('claude');
		expect(repo.saved?.prepared[0].preparedAt).toBe('yesterday');
	});

	it('re-stamps it when the reason is rewritten: whoever argued it is who you are reading', async () => {
		const stored: ProjectCoherenceDraft = {
			...createEmptyCoherenceDraft('p1'),
			prepared: [{ ...prep('g1'), preparedById: 'claude', preparedAt: 'yesterday' }]
		};
		const { repo, useCase } = over(stored, [openGap('g1')]);
		await useCase.execute(
			{ ...createEmptyCoherenceDraft('p1'), prepared: [prep('g1', 'a different argument')] },
			anySave,
			{ id: 'ana@example.com', kind: 'person' }
		);
		expect(repo.saved?.prepared[0]).toMatchObject({
			reason: 'a different argument',
			preparedById: 'ana@example.com',
			preparedByKind: 'person'
		});
	});
});
