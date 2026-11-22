import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type ActContext, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, type RetrospecDocument } from './document';
import { canReviewElement, specValidationBoard, waitingOn, type SpecElement } from './spec-validation';
import { requiredValidators, type TeamMember } from './spec-validators';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const bob = { id: 'bob@acme.io', name: 'Bob R.' };
const cleo = { id: 'cleo@acme.io', name: 'Cleo D.' };
const at = (min: number) => `2026-10-26T10:${String(min).padStart(2, '0')}:00.000Z`;
const ctx = (actor = ana, min = 0): ActContext => ({ actor, now: at(min) });

function act(doc: RetrospecDocument, acts: RetrospecAct[], c = ctx()): RetrospecDocument {
	const out = applyRetrospecActs(doc, acts, c);
	if (!out.ok) throw new Error(out.reason);
	return out.doc;
}
const validate = (itemId: string): RetrospecAct => ({ op: 'validate', itemId, title: itemId, tab: 'spec360' });

const elements: SpecElement[] = [
	{ id: 'problem', title: 'Current situation', owner: 'product' },
	{ id: 'branding', title: 'Branding', owner: 'design' },
	{ id: 'datamap', title: 'Datamap', owner: 'tech' }
];
const team: TeamMember[] = [
	{ person: ana, jobIds: ['product'] },
	{ person: bob, jobIds: ['design'] },
	{ person: cleo, jobIds: [] }
];

describe('who must validate an element', () => {
	it('is the lead and the people holding the job that owns it, each once', () => {
		expect(requiredValidators('design', ana, team)).toEqual([ana, bob]);
		expect(requiredValidators('product', ana, team)).toEqual([ana]);
	});

	it('is the lead alone when nobody holds the job, or on an install without jobs', () => {
		expect(requiredValidators('tech', cleo, team)).toEqual([cleo]);
		expect(requiredValidators('design', cleo, [])).toEqual([cleo]);
	});
});

describe('the validation of the Specification 360°', () => {
	it('reads every element to review before anyone acted, the reader leading', () => {
		const board = specValidationBoard({ doc: emptyRetrospecDocument(), elements, team, viewer: ana, baselines: [] });
		expect(board.summary).toEqual({ state: 'draft', total: 3, validated: 0, waiting: 0, toReview: 3, version: null });
		expect(board.lead).toEqual(ana);
		expect(board.standings.branding.missing).toEqual([ana, bob]);
		expect(board.complete).toBe(false);
	});

	it('waits for the owner once the lead validated, and counts validations got over needed', () => {
		const doc = act(emptyRetrospecDocument(), [validate('problem'), validate('branding')]);
		const board = specValidationBoard({ doc, elements, team, viewer: bob, baselines: [] });
		// The run started with Ana's first act: she leads whoever reads.
		expect(board.lead).toEqual(ana);
		expect(board.summary).toMatchObject({ validated: 1, waiting: 1, toReview: 1 });
		expect(board.standings.branding).toMatchObject({ state: 'waiting', missing: [bob] });
		// problem 1/1, branding 1/2, datamap 0/1 (Ana alone: nobody holds tech).
		expect(board.pct).toBe(50);
	});

	it('is complete once every required validator validated', () => {
		let doc = act(emptyRetrospecDocument(), [validate('problem'), validate('branding'), validate('datamap')]);
		doc = act(doc, [validate('branding')], ctx(bob, 1));
		expect(specValidationBoard({ doc, elements, team, viewer: ana, baselines: [] }).complete).toBe(true);
	});

	it('does not count a validation by someone not required', () => {
		const doc = act(emptyRetrospecDocument(), [validate('problem')], ctx(cleo));
		const board = specValidationBoard({ doc, elements, team, viewer: ana, baselines: [] });
		// Cleo started the run: she leads, and Ana owns the product part.
		expect(board.standings.problem).toMatchObject({ state: 'waiting', missing: [ana] });
	});
});

describe('what waits on one person', () => {
	it('is every element missing their validation, rejected ones aside, whatever its number', () => {
		const many: SpecElement[] = Array.from({ length: 900 }, (_, i) => ({ id: `e${i}`, title: `E${i}`, owner: 'design' as const }));
		let doc = act(emptyRetrospecDocument(), [validate('e0')]);
		doc = act(doc, [{ op: 'reject', itemId: 'e1', title: 'E1', tab: 'spec360' }]);
		const board = specValidationBoard({ doc, elements: many, team, viewer: ana, baselines: [] });
		const ana$ = waitingOn(board, ana);
		expect(ana$).toHaveLength(898);
		expect(ana$).not.toContain('e0');
		expect(ana$).not.toContain('e1');
		// Bob owns design: he is still awaited on the one Ana validated.
		expect(waitingOn(board, bob)).toContain('e0');
		expect(waitingOn(board, cleo)).toEqual([]);
	});
});

describe('who may validate an element', () => {
	const run = act(emptyRetrospecDocument(), [{ op: 'start_review', total: 3 }], ctx(cleo));
	const byId = (id: string) => elements.find((e) => e.id === id);

	it('is someone it waits on: the lead or the holder of the job that owns it [criterion:d1703bb6]', () => {
		expect(canReviewElement(run, byId('problem'), team, cleo, true)).toBe(true);
		expect(canReviewElement(run, byId('problem'), team, ana, true)).toBe(true);
	});

	it('is never a writer it does not wait on [criterion:d1703bb6]', () => {
		// Bob may write, but the problem waits on Cleo (the lead) and Ana (product) only.
		expect(canReviewElement(run, byId('problem'), team, bob, true)).toBe(false);
		const outcome = applyRetrospecActs(run, [validate('problem')], { ...ctx(bob), canReview: (doc, itemId) => canReviewElement(doc, byId(itemId), team, bob, true) });
		expect(outcome).toEqual({ ok: false, reason: 'This question does not require your validation.' });
	});

	it('makes a writer the lead while no run names one, never a reader [criterion:787a9fec]', () => {
		expect(canReviewElement(emptyRetrospecDocument(), byId('branding'), team, cleo, true)).toBe(true);
		expect(canReviewElement(emptyRetrospecDocument(), byId('branding'), team, cleo, false)).toBe(false);
	});

	it('keeps the reader\'s own standing validation within reach, to withdraw it [criterion:00d0d300]', () => {
		const validated = act(run, [validate('problem')], ctx(bob));
		expect(canReviewElement(validated, byId('problem'), team, bob, true)).toBe(true);
	});

	it('refuses an element the specification no longer holds', () => {
		expect(canReviewElement(run, undefined, team, cleo, true)).toBe(false);
	});
});

describe('the publication of a run', () => {
	it('is refused while an element waits, whoever sends start_review then publish [criterion:6972f3ea]', () => {
		const outcome = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: {} }, { op: 'start_review', total: 3 }, { op: 'publish', baselineId: 'b1' }], {
			...ctx(),
			canPublish: (doc) => specValidationBoard({ doc, elements, team, viewer: ana, baselines: [] }).complete
		});
		expect(outcome).toEqual({ ok: false, reason: 'Validate every element before validating the specification definitively.' });
	});
});
