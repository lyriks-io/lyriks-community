import { describe, expect, it } from 'vitest';
import { addDraftLeafAct, openRequestAct, type ActContext, type ActOutcome } from './acts';
import type { Actor, EvolutionRequest } from './draft';
import { materialiseDrafts, pruneDraftMeta, type Tree } from './materialise';

/**
 * What somebody signs on a draft has to reach the specification.
 *
 * A value proposed on a draft is written through to its canonical section
 * (ac-evo-wt-2), and for a feature that does not exist yet that section has
 * nowhere to put it but a row of its own, keyed by the draft id. These pin the
 * two ends of the road that was broken on 2026-09-23: the row survives until the
 * freeze, and the freeze carries it onto the feature instead of writing only
 * what happened to be typed on the draft object.
 */

const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };

let counter = 0;
const ctx = (): ActContext => ({
	actor: person,
	at: '2026-09-23T12:00:00.000Z',
	newId: () => `id-${++counter}`,
	soloWorkspace: false
});

const known = new Set(['feat-a']);

const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};

const opened = (): EvolutionRequest =>
	ok(
		openRequestAct(ctx(), {
			title: 'Fold the machine away',
			origin: 'internal_idea',
			requester: 'ana',
			leafIds: [],
			knownLeafIds: known
		})
	);

const tree = (leafMeta: Tree['leafMeta']): Tree => ({
	cores: [{ id: 'c1' }],
	features: [
		{
			id: 'feat-a',
			name: 'Operate the installation',
			coreId: 'c1',
			parentFamilyId: null,
			description: 'The levers.',
			unspaghettitFeatureId: 'feat-a'
		}
	],
	leafMeta
});

describe('a value signed on a draft reaches the feature', () => {
	it('carries the signed fields onto the amended feature at the freeze', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', description: 'The levers, ticked.' }, known)
		);
		const draftId = request.drafts[0].id;
		// The road a proposal takes: the value lands in the draft's own row, never
		// on the draft object.
		const out = materialiseDrafts(
			tree({
				'feat-a': { status: 'done', objective: 'Give the operator the levers.' },
				[draftId]: {
					objective: 'Make every switch read as something you may untick.',
					problem: 'A round dot reads as a decision already taken.',
					value: 'An administrator stops being wary of their own switches.',
					acceptanceCriteria: [{ id: 'c-new', text: 'Each switch is a square carrying a tick.' }]
				}
			}),
			request,
			'2026-09-23T12:00:00.000Z'
		);
		const meta = out.features.leafMeta?.['feat-a'];
		expect(meta?.objective).toBe('Make every switch read as something you may untick.');
		expect(meta?.problem).toBe('A round dot reads as a decision already taken.');
		expect(meta?.value).toBe('An administrator stops being wary of their own switches.');
		// And the row it came from stops naming anything.
		expect(out.features.leafMeta?.[draftId]).toBeUndefined();
	});

	it('adds the signed criteria to the ones the feature already holds', () => {
		const request = ok(
			addDraftLeafAct(ctx(), opened(), { kind: 'amend', baseLeafId: 'feat-a', description: 'The levers, ticked.' }, known)
		);
		const draftId = request.drafts[0].id;
		const out = materialiseDrafts(
			tree({
				'feat-a': {
					acceptanceCriteria: [
						{ id: 'c-old', text: 'Reset workspace is triple-gated.' },
						{ id: 'c-dup', text: 'Each switch is a square carrying a tick.' }
					]
				},
				[draftId]: {
					acceptanceCriteria: [
						{ id: 'c-new', text: 'Each switch is a square carrying a tick.' },
						{ id: 'c-new-2', text: 'No lone boolean is drawn as a round dot.' }
					]
				}
			}),
			request,
			'2026-09-23T12:00:00.000Z'
		);
		const texts = (out.features.leafMeta?.['feat-a']?.acceptanceCriteria ?? []).map((c) => c.text);
		// Nobody questioned the old line, so an amendment does not drop it.
		expect(texts).toContain('Reset workspace is triple-gated.');
		expect(texts).toContain('No lone boolean is drawn as a round dot.');
		// And the same sentence twice stays one line.
		expect(texts.filter((t) => t === 'Each switch is a square carrying a tick.')).toHaveLength(1);
	});

	// Reversed on 2026-09-23 by request 5e8b1c47: a signature is a person's act and
	// the draft's text is a client's opening move, so the signed row wins. The other
	// way round, a person signed a value and the feature carried something else.
	it('prefers what a row holds, signed, over what was typed on the draft', () => {
		const request = ok(
			addDraftLeafAct(
				ctx(),
				opened(),
				{ kind: 'amend', baseLeafId: 'feat-a', description: 'x', objective: 'Typed on the draft.' },
				known
			)
		);
		const draftId = request.drafts[0].id;
		const out = materialiseDrafts(
			tree({ [draftId]: { objective: 'Signed in the row.' } }),
			request,
			'2026-09-23T12:00:00.000Z'
		);
		expect(out.features.leafMeta?.['feat-a']?.objective).toBe('Signed in the row.');
	});

	it('forgets the rows of a request that no longer exists', () => {
		const before = tree({ 'feat-a': { status: 'done' }, 'draft:gone': { objective: 'Signed, then deleted.' } });
		const after = pruneDraftMeta(before, ['draft:gone']);
		expect(after.changed).toBe(true);
		expect(after.features.leafMeta?.['draft:gone']).toBeUndefined();
		expect(after.features.leafMeta?.['feat-a']?.status).toBe('done');
	});
});
