import { describe, expect, it } from 'vitest';
import {
	LANDED_REFUSALS,
	SPEC360_TAB,
	applyRetrospecActs,
	emptyRetrospecDocument,
	landedValidationRefusal,
	landingInKnowledge,
	specValidationBoard,
	type PersonRef,
	type RetrospecAct,
	type RetrospecDocument,
	type SpecElement,
	type TeamMember
} from './index';

/**
 * "Validate an element a landed request delivered" (action 8dcd7879 of EVO-002),
 * its scenarios run against the real code: the landing's reading of Knowledge
 * (landingInKnowledge), the acts it records, and the standing the board reads.
 */

const NOW = '2026-11-20T10:00:00.000Z';
const lead: PersonRef = { id: 'lead@company.test', name: 'Lead' };
const owner: PersonRef = { id: 'owner@company.test', name: 'Owner' };
const element: SpecElement = { id: 'stack:a', title: 'Stack', fingerprint: 'f-1' };
const request = { requestId: 'req-2', requestKey: 'EVO-002', approvedBy: [lead], at: NOW };

/** The state the scenarios start from, the surface's defaults under each scenario's overrides. */
interface Given {
	readonly required?: number;
	readonly validations?: number;
	readonly rejected?: boolean;
	readonly inSpec?: boolean;
	readonly proved?: boolean;
	readonly alreadyGiven?: boolean;
	readonly specification?: 'draft' | 'validated';
}

const apply = (doc: RetrospecDocument, acts: readonly RetrospecAct[], actor = lead): RetrospecDocument => {
	const outcome = applyRetrospecActs(doc, acts, { actor, now: NOW });
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.doc;
};

/** The document and team a state stands for: the lead first, then whoever holds the job owning the element. */
function sceneOf(given: Given): { doc: RetrospecDocument; team: TeamMember[] } {
	const team: TeamMember[] = [{ person: lead, jobIds: [] }, ...((given.required ?? 1) > 1 ? [{ person: owner, jobIds: ['tech'] }] : [])];
	let doc = apply(emptyRetrospecDocument(), [{ op: 'start_review', total: 1 }]);
	for (const person of [lead, owner].slice(0, given.validations ?? 0)) doc = apply(doc, [{ op: 'validate', itemId: element.id, title: element.title, tab: SPEC360_TAB }], person);
	if (given.rejected) doc = apply(doc, [{ op: 'reject', itemId: element.id, title: element.title, tab: SPEC360_TAB }]);
	if (given.alreadyGiven)
		doc = apply(doc, [
			{ op: 'validate_through_request', itemId: element.id, title: element.title, tab: SPEC360_TAB, validation: { ...request, fingerprint: 'f-1' } },
			{ op: 'withdraw_request_validation', itemId: element.id }
		]);
	if (given.specification === 'validated') doc = { ...doc, runs: doc.runs.map((run) => ({ ...run, publishedAt: NOW, publishedBy: lead })) };
	return { doc, team };
}

/** The adapter: the landing reads the element, records what it validates, and the board reads it back. */
function invoke(given: Given) {
	const { doc, team } = sceneOf(given);
	const landing = landingInKnowledge(doc, request, [{ id: element.id, element: given.inSpec === false ? undefined : element, proved: given.proved !== false }], SPEC360_TAB);
	const after = apply(doc, landing.acts);
	const standing = specValidationBoard({ doc: after, elements: [element], team, viewer: lead, baselines: [] }).standings[element.id];
	return {
		status: landing.validated.includes(element.id) ? 'success' : 'blocked',
		landing,
		state: { validatedThroughRequest: standing.through !== null, settled: standing.state === 'ok', missing: standing.missing.length }
	};
}

describe('Validate an element a landed request delivered', () => {
	it('validates a proved element at the landing [unspa:2e49df91:8dcd7879:e501535d]', () => {
		const run = invoke({});
		expect(run.status).toBe('success');
		expect(run.state).toMatchObject({ validatedThroughRequest: true, settled: true });
	});

	it('settles an element waiting on two with one validation through the request [unspa:2e49df91:8dcd7879:adbf67bf] [criterion:ac-leaf-939f5eef-4139-4159-9fc0-c5221c6ae73f]', () => {
		const run = invoke({ required: 2, validations: 0 });
		expect(run.status).toBe('success');
		expect(run.state).toEqual({ validatedThroughRequest: true, settled: true, missing: 0 });
	});

	it('leaves an element the code holds in part to review [unspa:2e49df91:8dcd7879:8eaf0e1a]', () => {
		const run = invoke({ proved: false });
		expect(run.status).toBe('blocked');
		expect(run.state.settled).toBe(false);
		expect(run.landing.toReview).toEqual([element.id]);
	});

	it('validates nothing on a specification validated definitively [unspa:2e49df91:8dcd7879:2bafb2bc] [criterion:ac-leaf-cdec7d89-bfc1-4fde-a78f-ecfe7610e4eb]', () => {
		const run = invoke({ specification: 'validated' });
		expect(run.status).toBe('blocked');
		expect(run.landing).toMatchObject({ acts: [], validated: [], toReview: [], specValidated: true });
	});

	it('leaves an element whose change was requested to its people [unspa:2e49df91:8dcd7879:7f6e4651] [criterion:ac-leaf-9031cb49-a98f-41c1-bb7e-21cb2da42091]', () => {
		const run = invoke({ rejected: true });
		expect(run.status).toBe('blocked');
		expect(run.state).toMatchObject({ validatedThroughRequest: false, settled: false });
		expect(run.landing.toReview).toEqual([element.id]);
	});

	it('validates an element once per request, never again after a withdrawal [unspa:2e49df91:8dcd7879:b371de85]', () => {
		const run = invoke({ alreadyGiven: true });
		expect(run.status).toBe('blocked');
		expect(run.state.validatedThroughRequest).toBe(false);
	});

	it('does not validate an element removed meanwhile [unspa:2e49df91:8dcd7879:c44b70d8]', () => {
		const run = invoke({ inSpec: false });
		expect(run.status).toBe('blocked');
		expect(run.landing).toMatchObject({ acts: [], validated: [], toReview: [] });
	});
});

describe('the rules that refuse a validation through a request', () => {
	const refusalOf = (given: Given) => {
		const { doc } = sceneOf(given);
		return landedValidationRefusal(doc, request.requestId, { id: element.id, inSpec: given.inSpec !== false, proved: given.proved !== false });
	};

	it('refuses on a validated specification (rule a5f1d7b5)', () => expect(refusalOf({ specification: 'validated' })).toBe(LANDED_REFUSALS.specValidated));
	it('refuses an element no longer in the specification (rule 2f7be7dc)', () => expect(refusalOf({ inSpec: false })).toBe(LANDED_REFUSALS.notInSpec));
	it('refuses an element a line of which is not proved (rule fdac7020)', () => expect(refusalOf({ proved: false })).toBe(LANDED_REFUSALS.notProved));
	it('refuses an element whose change was requested (rule 8a28a126)', () => expect(refusalOf({ rejected: true })).toBe(LANDED_REFUSALS.changeRequested));
	it('refuses to give the same request validation twice (rule 4fe153c9)', () => expect(refusalOf({ alreadyGiven: true })).toBe(LANDED_REFUSALS.alreadyGiven));

	it('refuses the act itself on the document it lands on, whatever the landing read before', () => {
		const { doc } = sceneOf({ rejected: true });
		const act: RetrospecAct = { op: 'validate_through_request', itemId: element.id, title: element.title, tab: SPEC360_TAB, validation: { ...request, fingerprint: 'f-1' } };
		expect(applyRetrospecActs(doc, [act], { actor: lead, now: NOW })).toEqual({ ok: false, reason: LANDED_REFUSALS.changeRequested });
	});
});

describe('a validation through a request on later reads', () => {
	const landed = () => apply(sceneOf({}).doc, invoke({}).landing.acts);

	it('stops standing once the element reads otherwise than it landed', () => {
		const changed = { ...element, fingerprint: 'f-2' };
		const standing = specValidationBoard({ doc: landed(), elements: [changed], team: [{ person: lead, jobIds: [] }], viewer: lead, baselines: [] }).standings[element.id];
		expect(standing).toMatchObject({ state: 'todo', through: null });
	});

	it('is taken back by a change requested on the element (invariant 4b808089)', () => {
		const doc = apply(landed(), [{ op: 'reject', itemId: element.id, title: element.title, tab: SPEC360_TAB }]);
		const standing = specValidationBoard({ doc, elements: [element], team: [{ person: lead, jobIds: [] }], viewer: lead, baselines: [] }).standings[element.id];
		expect(standing).toMatchObject({ rejected: true, through: null, state: 'todo' });
		expect(doc.runs.at(-1)?.throughRequests?.[element.id]?.withdrawn?.by).toEqual(lead);
	});

	it('is carried by a later run while the element reads the same', () => {
		const closing = apply(landed(), [{ op: 'start', mode: 'repo', baseline: { features: 3 }, closesRun: true, fingerprints: { [element.id]: 'f-1', 'stack:b': 'x' } }]);
		expect(closing.runs.at(-1)?.throughRequests?.[element.id]?.requestKey).toBe('EVO-002');
		const moved = apply(landed(), [{ op: 'start', mode: 'repo', baseline: { features: 3 }, closesRun: true, fingerprints: { [element.id]: 'f-2' } }]);
		expect(moved.runs.at(-1)?.throughRequests).toBeUndefined();
	});
});
