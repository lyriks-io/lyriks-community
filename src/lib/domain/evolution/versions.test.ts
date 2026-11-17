import { describe, expect, it } from 'vitest';
import { amend, freeze } from './freeze';
import { updateDraftLeafAct } from './acts';
import { createDraftLeaf, createEmptyStepAnswers, createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { readVersions, snapshotOf, versionDiff } from './versions';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { withSolutionValidated } from './solution-validated.fixture';

/**
 * Frozen versions kept whole and compared. What these tests pin is the
 * specification of feat-evo-spec-freeze: ac-evo-freeze-5 (every version stays
 * readable in full), ac-evo-freeze-versions-access (newest first, read-only,
 * each with what changed) and ac-evo-freeze-diff (what changed, by kind,
 * before and after).
 */

const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };

const withNote = (overrides: Partial<EvolutionRequest> = {}): EvolutionRequest => withSolutionValidated(withNoteRaw(overrides));
const withNoteRaw = (overrides: Partial<EvolutionRequest> = {}): EvolutionRequest =>
	createEvolutionRequest({
		id: 'r1',
		title: 'A note with the order',
		origin: 'customer_feedback',
		stage: 'coherence',
		need: { description: 'd', situation: 'No note today.', symptoms: '', cost: '', objectives: 'A note travels with the order.', measures: 'Calls: 6 -> 1' },
		drafts: [
			createDraftLeaf({
				id: 'draft:note',
				kind: 'amend',
				baseLeafId: 'feat-order',
				changeSummary: 'The cart takes a note.',
				acceptanceCriteria: [
					{ id: 'c1', text: 'A note of 140 characters at most.' },
					{ id: 'c2', text: 'The note is frozen once the order is placed.' }
				],
				behaviourModel: {
					operations: [
						{ kind: 'add_action', name: 'Write a note' },
						{ kind: 'add_action_rule', text: 'At most 140 characters' }
					],
					mintedIds: [],
					updatedAt: ''
				}
			})
		],
		...overrides
	});

describe('a frozen version is kept whole', () => {
	it('keeps a copy of the need, the steps and each subject at the freeze, and the copy survives the dossier being read back', () => {
		const frozen = freeze(withNote(), ana, '2026-10-08T09:00:00.000Z');
		const kept = frozen.frozenVersions[0].snapshot!;
		expect(kept.need.measures).toBe('Calls: 6 -> 1');
		expect(kept.subjects[0]).toMatchObject({
			id: 'draft:note',
			changeSummary: 'The cart takes a note.',
			criteria: [
				{ id: 'c1', text: 'A note of 140 characters at most.' },
				{ id: 'c2', text: 'The note is frozen once the order is placed.' }
			],
			elements: [
				{ kind: 'action', label: 'Write a note', status: 'added' },
				{ kind: 'rule', label: 'At most 140 characters', status: 'added' }
			]
		});

		// Written as JSON and read back the way the dossier is: nothing of the copy is pruned.
		const read = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [frozen], lastSavedAt: null })), 'p');
		expect(read.requests[0].frozenVersions[0].snapshot).toEqual(kept);
	});

	it('never moves once the request moves on, and a version frozen before copies were kept reads as such', () => {
		const frozen = freeze(withNote(), ana, '2026-10-08T09:00:00.000Z');
		const moved = { ...amend(frozen), need: { ...frozen.need, cost: '45 minutes a Saturday' } };
		expect(moved.frozenVersions[0].snapshot!.need.cost).toBe('');

		const old = createEvolutionRequest({ id: 'r0', title: 'Old', origin: 'internal_idea', stage: 'implementation', frozen: true, specVersion: 1, frozenVersions: [{ version: 1, at: '2026-09-01', by: 'bo' }] });
		expect(readVersions(old).versions).toEqual([{ version: 1, at: '2026-09-01', by: 'bo', snapshot: null, changes: null }]);
	});
});

describe('what changed from one version to the next', () => {
	it('lists need answers, criteria and behaviour by kind, before and after side by side', () => {
		const v1 = snapshotOf(withNote());
		const next = withNote();
		next.need = { ...next.need, measures: 'Calls: 6 -> 0' };
		next.drafts[0].acceptanceCriteria = [
			{ id: 'c1', text: 'A note of 200 characters at most.' },
			{ id: 'c3', text: 'The baker sees the note when packing.' }
		];
		next.drafts[0].behaviourModel!.operations = [{ kind: 'add_action', name: 'Write a note' }];
		const changes = versionDiff(v1, snapshotOf(next));
		expect(changes).toEqual([
			{ kind: 'need', status: 'changed', label: 'Measures', before: 'Calls: 6 -> 1', after: 'Calls: 6 -> 0' },
			{ kind: 'criterion', status: 'changed', label: 'Criterion', where: 'feat-order', before: 'A note of 140 characters at most.', after: 'A note of 200 characters at most.' },
			{ kind: 'criterion', status: 'added', label: 'Criterion', where: 'feat-order', after: 'The baker sees the note when packing.' },
			{ kind: 'criterion', status: 'removed', label: 'Criterion', where: 'feat-order', before: 'The note is frozen once the order is placed.' },
			{ kind: 'behaviour', status: 'removed', label: 'creates rule', where: 'feat-order', before: 'At most 140 characters' }
		]);
		expect(versionDiff(v1, snapshotOf(withNote()))).toEqual([]);
	});

	it('keeps what the Functional spec answered and says when an answer was rewritten (ac-evo-func-prose)', () => {
		const v1 = snapshotOf(withNote({ stepAnswers: { ...createEmptyStepAnswers(), functional_spec: { refusals: 'No note over 140 characters.', failures: '' } } }));
		const v2 = snapshotOf(withNote({ stepAnswers: { ...createEmptyStepAnswers(), functional_spec: { refusals: 'No note over 200 characters.', failures: '' } } }));
		expect(v1.answers?.functional_spec.refusals).toBe('No note over 140 characters.');
		expect(versionDiff(v1, v2)).toEqual([
			{ kind: 'step', status: 'changed', label: 'Functional spec: its rules', before: 'No note over 140 characters.', after: 'No note over 200 characters.' }
		]);
		// A copy kept before the answers existed reads as holding none.
		const { answers: _gone, ...older } = v1;
		expect(versionDiff(older, v1)).toEqual([{ kind: 'step', status: 'added', label: 'Functional spec: its rules', after: 'No note over 140 characters.' }]);
	});

	it('reads every version newest first with its changes, and what changed since the last freeze on a reopened request', () => {
		let request = freeze(withNote(), ana, '2026-10-08T09:00:00.000Z');
		request = amend(request);
		request = { ...request, drafts: [...request.drafts, createDraftLeaf({ id: 'draft:sms', kind: 'add', name: 'Text when ready' })] };
		const reopened = readVersions(request);
		expect(reopened.sinceLast).toEqual([{ kind: 'subject', status: 'added', label: 'Text when ready' }]);

		request = freeze({ ...request, stage: 'coherence' }, ana, '2026-10-09T09:00:00.000Z');
		const { versions, sinceLast } = readVersions(request);
		expect(sinceLast).toBeNull();
		expect(versions.map((v) => [v.version, v.changes?.length ?? null])).toEqual([
			[2, 1],
			[1, null]
		]);
	});
});

describe('a criterion keeps its identity across updates', () => {
	it('keeps the id of an unchanged text, rewords one sent with its id, and the version comparison reads it as reworded', () => {
		let n = 0;
		const ctx = { actor: ana, at: '2026-10-08T10:00:00.000Z', newId: () => `new-${++n}`, soloWorkspace: true };
		const before = withNote({ stage: 'specification' });
		const outcome = updateDraftLeafAct(
			ctx,
			before,
			'draft:note',
			{
				acceptanceCriteria: [
					{ id: 'c1', text: 'A note of 200 characters at most.' },
					'The note is frozen once the order is placed.',
					'The baker sees the note when packing.'
				]
			},
			new Set(['feat-order'])
		);
		if (!outcome.ok) throw new Error(outcome.reason);
		expect(outcome.request.drafts[0].acceptanceCriteria).toEqual([
			{ id: 'c1', text: 'A note of 200 characters at most.' },
			{ id: 'c2', text: 'The note is frozen once the order is placed.' },
			{ id: 'new-1', text: 'The baker sees the note when packing.' }
		]);
		const changes = versionDiff(snapshotOf(before), snapshotOf(outcome.request)).filter((c) => c.kind === 'criterion');
		expect(changes.map((c) => [c.status, c.after])).toEqual([
			['changed', 'A note of 200 characters at most.'],
			['added', 'The baker sees the note when packing.']
		]);
	});
});

describe('a version comparison a person can read', () => {
	it('never reads a criterion that only lost its id as removed then added, and names a subject by its feature', () => {
		const before = snapshotOf(withNote());
		const next = withNote();
		next.drafts[0].acceptanceCriteria = [
			{ id: 'x1', text: 'A note of 140 characters at most.' },
			{ id: 'x2', text: 'The baker sees the note when packing.' }
		];
		const changes = versionDiff(before, snapshotOf(next), (id) => (id === 'feat-order' ? 'Order online' : id)).filter((c) => c.kind === 'criterion');
		expect(changes).toEqual([
			{ kind: 'criterion', status: 'added', label: 'Criterion', where: 'Order online', after: 'The baker sees the note when packing.' },
			{ kind: 'criterion', status: 'removed', label: 'Criterion', where: 'Order online', before: 'The note is frozen once the order is placed.' }
		]);
	});
});

describe('a version freezes the changes to the other pages and to the rules [criterion:ac-leaf-ac-evo-draft-section-version]', () => {
	const section = { id: 'section:s1', page: 'requirements' as const, summary: 'Encryption in transit is stated', edits: [{ op: 'add_to_set' as const, path: 'definition.security.encryption', value: 'in_transit' }], sourceIds: [], materialisedAt: null };
	const rule = {
		id: 'rules:r1',
		summary: 'An expired link never redirects',
		operations: [{ kind: 'add_project_invariant', name: 'An expired link never redirects', condition: { left: 'link.expired', operator: 'is_false' } }],
		sourceIds: [],
		materialisedAt: null
	};

	it('keeps a copy of each at the freeze, read back whole from the stored dossier', () => {
		const frozen = freeze(withNote({ sectionDrafts: [section], ruleDrafts: [rule] }), ana, '2026-10-28T09:00:00.000Z');
		const kept = frozen.frozenVersions[0].snapshot!;
		expect(kept.sections).toEqual([{ id: 'section:s1', page: 'requirements', summary: 'Encryption in transit is stated', edits: section.edits }]);
		expect(kept.rules).toEqual([{ id: 'rules:r1', summary: 'An expired link never redirects', operations: rule.operations }]);
		const read = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [frozen], lastSavedAt: null })), 'p');
		expect(read.requests[0].frozenVersions[0].snapshot).toEqual(kept);
	});

	it('lists each one added, removed or rewritten between two versions, by the page as the spec names it', () => {
		const before = snapshotOf(withNote({ sectionDrafts: [section], ruleDrafts: [rule] }));
		const after = snapshotOf(withNote({ sectionDrafts: [{ ...section, summary: 'Encryption in transit and at rest' }], ruleDrafts: [] }));
		expect(versionDiff(before, after).filter((c) => c.kind === 'section' || c.kind === 'rule')).toEqual([
			{ kind: 'section', status: 'changed', label: 'Requirements change', before: 'Encryption in transit is stated (1 edit)', after: 'Encryption in transit and at rest (1 edit)' },
			{ kind: 'rule', status: 'removed', label: 'Rules the whole product keeps change', before: 'An expired link never redirects (1 operation)' }
		]);
	});
});
