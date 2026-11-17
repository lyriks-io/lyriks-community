import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type ActContext, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, type RetrospecDocument } from './document';
import { specValidationBoard, specValidationSummary, waitingOn, type SpecElement } from './spec-validation';
import { requiredValidators, type TeamMember } from './spec-validators';
import type { Baseline } from '../baselines';

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
const baseline = (id: string, min: number): Baseline => ({ id, name: id, note: '', createdAt: at(min), readiness: 0, coherence: 0, featureCount: 0, content: '' });

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

	it('is complete once every required validator validated, then VALIDATED with v1.0 once published', () => {
		let doc = act(emptyRetrospecDocument(), [validate('problem'), validate('branding'), validate('datamap')]);
		doc = act(doc, [validate('branding')], ctx(bob, 1));
		expect(specValidationBoard({ doc, elements, team, viewer: ana, baselines: [] }).complete).toBe(true);
		doc = act(doc, [{ op: 'publish', baselineId: 'b1', notify: [ana, bob] }], ctx(ana, 2));
		const summary = specValidationSummary({ doc, elements, team, viewer: ana, baselines: [baseline('b1', 2), baseline('b2', 5)] });
		expect(summary.state).toBe('validated');
		expect(summary.version).toEqual({ label: 'v1.1', previous: 'v1.0', baselineId: 'b2' });
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
