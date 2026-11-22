import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest, type EvolutionRequest, type ImplementationFinding } from './draft';
import { correctionFreezeGate, draftsOpen, freezeCorrection, inCorrection, openCorrection, parseSpecCorrection, textsOpen } from './correction';
import { dueReadings } from './automatic-readings';
import { readVersions, snapshotOf } from './versions';
import type { ActOutcome } from './acts';

/**
 * EVO-012 at the domain: what stays open in the Build, what the correction
 * opens, and what its freeze leaves the report and the readings with.
 */
const ctx = { actor: { id: 'ana@example.test', kind: 'person' as const, role: 'admin' as const }, at: '2026-11-20T10:00:00Z', newId: () => 'h-1' };
const line = (id: string, key: string | undefined, decision: ImplementationFinding['decision']): ImplementationFinding => ({
	id,
	iteration: 1,
	verdict: 'non_conform',
	requirement: id,
	filePath: '',
	lineRange: '',
	specStatement: '',
	codeStatement: '',
	leafId: 'feat-1',
	...(key ? { key } : {}),
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 1,
	scope: 'request',
	decision,
	decidedBy: decision === 'undecided' ? null : 'ana@example.test',
	decidedAt: decision === 'undecided' ? null : '2026-11-20T09:00:00Z'
});

function atBuild(over: Partial<EvolutionRequest> = {}): EvolutionRequest {
	const request = createEvolutionRequest({
		id: 'r',
		stage: 'implementation',
		frozen: true,
		specVersion: 1,
		drafts: [createDraftLeaf({ id: 'draft:r-1', kind: 'amend', baseLeafId: 'feat-1', acceptanceCriteria: [{ id: 'c-1', text: 'A saved cart comes back' }] })],
		dataDrafts: [{ id: 'data:d-1', kind: 'add', entityId: null, name: 'Saved cart', description: '', addFields: [], changeFields: [], removeFields: [], materialisedAs: null, materialisedAt: null }],
		coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: '2026-11-20T09:00:00Z' },
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: '2026-11-20T09:00:00Z' },
		...over
	});
	return { ...request, frozenVersions: [{ version: 1, at: '2026-11-20T08:00:00Z', by: 'ana@example.test', snapshot: snapshotOf(request) }] };
}
const opened = (request: EvolutionRequest, prints: Record<string, string> | null = null): EvolutionRequest => {
	const outcome = openCorrection(ctx, request, { ok: true, request, summary: 'Drafted' }, true, prints) as Extract<ActOutcome, { ok: true }>;
	return outcome.request;
};

describe('what a request proposes stays open in the Build, and closes from Approval on [criterion:ac-leaf-02387d5f-fc65-4f86-80c4-6eb2f5ec2b7b]', () => {
	it('allows a change before the freeze and in the Build', () => {
		expect(draftsOpen({ frozen: false, stage: 'specification', specVersion: 0 }).ok).toBe(true);
		expect(draftsOpen({ frozen: true, stage: 'implementation', specVersion: 1 }).ok).toBe(true);
	});

	it('refuses it in Approval and in Deployment, naming a new request', () => {
		for (const [stage, name] of [['acceptance', 'Approval'], ['delivered', 'Deployment']] as const) {
			const refused = draftsOpen({ frozen: true, stage, specVersion: 2 });
			expect(refused.ok).toBe(false);
			if (!refused.ok) {
				expect(refused.reason).toBe(`This request stands in ${name}: what it proposes is no longer corrected. Open a new request to change it.`);
				expect(refused.detail).toContain('open_request');
			}
		}
	});
});

describe('the Need, the Solution and the specs are rewritten after a rebrief only [criterion:ac-leaf-ac1e6bb8-1aa7-4e33-b488-d38103c2d03d]', () => {
	it('names Reopen the spec for revision vN+1 in the refusal of a frozen version, and refuses nothing before the freeze', () => {
		const refused = textsOpen({ frozen: true, specVersion: 3 });
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toBe('The specification is frozen as version 3: the Need, the Solution and the specs are not corrected in the Build. Reopen the spec for revision v4 to rewrite them.');
		expect(textsOpen({ frozen: false, specVersion: 3 }).ok).toBe(true);
	});
});

describe('a correction opens version N+1 and keeps the build on version N [criterion:ac-leaf-d9a4be34-310c-4d61-b7e4-d3bcd396fdcf]', () => {
	it('marks the version it corrects, leaves the version number and the freeze as they are, and says so in the history', () => {
		const request = opened(atBuild(), { 'action:a3': 'p-1' });
		expect(inCorrection(request)).toBe(true);
		expect(request).toMatchObject({ stage: 'implementation', frozen: true, specVersion: 1, correction: { of: 1, openedAt: ctx.at, openedBy: 'ana@example.test', prints: { 'action:a3': 'p-1' } } });
		expect(request.history.at(-1)).toMatchObject({ type: 'spec_amended', summary: 'Version 2 in correction: what the request proposes changed in the Build; the code is still built against version 1' });
	});

	it('opens nothing when the act changed nothing the request proposes, or outside the Build', () => {
		const request = atBuild();
		expect(openCorrection(ctx, request, { ok: true, request, summary: 'Validated' }, false, null)).toEqual({ ok: true, request, summary: 'Validated' });
		const specifying = { ...request, stage: 'specification' as const, frozen: false };
		expect(inCorrection(opened(specifying))).toBe(false);
	});

	it('a viewer does not correct a version', () => {
		const request = atBuild();
		const refused = openCorrection({ ...ctx, actor: { ...ctx.actor, role: 'viewer' } }, request, { ok: true, request, summary: 'Drafted' }, true, null);
		expect(refused.ok).toBe(false);
	});

	it('reads the impact and the coherence again on its own, and keeps the report of version N', () => {
		const request = opened({ ...atBuild({ implementationFindings: [line('line-1', 'action:a3', 'validated')] }), history: [] });
		const changed = { ...request, history: [...request.history, { ...request.history[0], id: 'h-2', type: 'draft_change' as const, recordedAt: '2026-11-20T10:00:00Z' }] };
		expect(dueReadings(changed)).toEqual({ impact: ['change'], report: false });
		// The same request outside a correction reads nothing again: the readings belong to the Impact analysis.
		expect(dueReadings({ ...changed, correction: undefined }).impact).toEqual([]);
	});

	it('reads what changed since the version still built, as a version reopened does', () => {
		const request = opened(atBuild());
		const moved = { ...request, drafts: [{ ...request.drafts[0], acceptanceCriteria: [{ id: 'c-1', text: 'A saved cart comes back with its prices' }] }] };
		expect(readVersions(moved).sinceLast?.map((c) => c.status)).toEqual(['changed']);
		expect(readVersions(atBuild()).sinceLast).toBeNull();
	});

	it('is kept as stored, and reads as none when malformed', () => {
		expect(parseSpecCorrection({ of: 1, openedAt: 'x', openedBy: 'y', prints: { 'action:a': 'p-1', bad: 3 } })).toEqual({ correction: { of: 1, openedAt: 'x', openedBy: 'y', prints: { 'action:a': 'p-1' } } });
		expect(parseSpecCorrection({ of: 0 })).toEqual({});
		expect(parseSpecCorrection(null)).toEqual({});
	});
});

describe('the freeze of version N+1 in the Build [criterion:ac-leaf-c3376a9e-6d82-40f3-9461-aaa50646b51a]', () => {
	it('freezes the next version through the same freeze, closes the correction, and the history reads Specification corrected as version 2', () => {
		const frozen = freezeCorrection(ctx, opened(atBuild(), {}), { prints: {}, brought: new Set() });
		expect(frozen).toMatchObject({ stage: 'implementation', frozen: true, specVersion: 2 });
		expect(frozen.correction).toBeUndefined();
		expect(frozen.frozenVersions.map((v) => v.version)).toEqual([1, 2]);
		expect(frozen.history.at(-1)).toMatchObject({ type: 'spec_frozen', summary: 'Specification corrected as version 2' });
	});
});

describe('the report against version N+1 [criterion:ac-leaf-48373b35-1f77-487b-a083-e2536ab1183c]', () => {
	const lines = [line('line-a3', 'action:a3', 'validated'), line('line-a4', 'action:a4', 'adopted'), line('data-line:data:d-1', undefined, 'validated')];

	it('keeps the decision of a line whose element did not move, reads again the others, and is built again once frozen', () => {
		const request = opened(atBuild({ implementationFindings: lines }), { 'action:a3': 'p-1', 'action:a4': 'p-2' });
		const frozen = freezeCorrection(ctx, request, { prints: { 'action:a3': 'p-1', 'action:a4': 'p-9' }, brought: new Set() });
		expect(frozen.implementationFindings.map((l) => [l.id, l.decision])).toEqual([
			['line-a3', 'validated'],
			['line-a4', 'undecided'],
			['data-line:data:d-1', 'validated']
		]);
		// The lines name version 1: the report is due again, against version 2.
		expect(dueReadings(frozen).report).toBe(true);
	});

	it('reads again the line of a data change the correction rewrote', () => {
		const request = opened(atBuild({ implementationFindings: lines }), { 'action:a3': 'p-1', 'action:a4': 'p-2' });
		const rewritten = { ...request, dataDrafts: [{ ...request.dataDrafts[0], name: 'Kept cart' }] };
		const frozen = freezeCorrection(ctx, rewritten, { prints: { 'action:a3': 'p-1', 'action:a4': 'p-2' }, brought: new Set() });
		expect(frozen.implementationFindings.find((l) => l.id === 'data-line:data:d-1')?.decision).toBe('undecided');
	});

	it('carries nothing on a guess: without what version N read, every line of the request is read again', () => {
		const frozen = freezeCorrection(ctx, opened(atBuild({ implementationFindings: lines }), null), { prints: { 'action:a3': 'p-1' }, brought: new Set() });
		expect(frozen.implementationFindings.every((l) => l.decision === 'undecided')).toBe(true);
	});

	it('releases the entries held on the request that name an element the correction removed', () => {
		const request = opened(atBuild({ heldImplementation: { 'action:a3': { file: 'a.ts' }, 'action:a4': { file: 'b.ts' } } }), {});
		const frozen = freezeCorrection(ctx, request, { prints: {}, brought: new Set(['action:a3', 'criterion:ac-leaf-c-1']) });
		expect(frozen.heldImplementation).toEqual({ 'action:a3': { file: 'a.ts' } });
	});
});

describe('what holds the freeze of version N+1 [criterion:ac-leaf-2a796b1a-4ce6-4340-bd23-74c58659c3e0]', () => {
	const readings = { specification: { total: 1, validated: 1 }, criticalEmptyCount: 0, readingsBehind: false, staleModels: [] };

	it('without a correction there is nothing to freeze in the Build [unspa:13e955f6:faaf4508:6d5ceb57]', () => {
		const refused = correctionFreezeGate(atBuild(), readings);
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toBe('No corrected version waits on this request.');
	});

	it('a cancelled, closed or deleted request freezes nothing', () => {
		for (const [status, reason] of [['cancelled', 'This request is cancelled: reopen it first.'], ['closed', 'This request is closed.'], ['deleted', 'This request is deleted.']] as const) {
			const refused = correctionFreezeGate({ ...opened(atBuild()), status }, readings);
			expect(refused.ok).toBe(false);
			if (!refused.ok) expect(refused.reason).toBe(reason);
		}
	});

	it('an open request with everything validated may freeze', () => {
		expect(correctionFreezeGate(opened(atBuild()), readings).ok).toBe(true);
	});
});
