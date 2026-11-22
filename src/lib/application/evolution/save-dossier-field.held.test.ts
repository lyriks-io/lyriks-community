import { describe, expect, it } from 'vitest';
import { readDossierField, readHeldField, readTouchedField, saveDossierField } from './save-dossier-field';
import { createEvolutionRequest, fieldValidationOf, validateFieldAct, type EvolutionRequest } from '$domain/evolution';
import type { ProjectFeaturesDraft } from '$domain/features';

/**
 * A value given on a feature that exists waits on the request's amendment of it
 * until the change is official (ac-evo-wt-held): the feature reads as it was,
 * the dossier reads the value where it waits.
 */
const features = {
	projectId: 'p',
	cores: [{ id: 'core', name: 'Order', description: '', tone: 'commerce' }],
	families: [],
	features: [{ id: 'feat-pickup', name: 'Pick up', coreId: 'core', parentFamilyId: null, description: '', unspaghettitFeatureId: 'feat-pickup' }],
	leafMeta: { 'feat-pickup': { acceptanceCriteria: [{ id: 'c1', text: 'A bag is handed over only once ready.' }] } }
} as unknown as ProjectFeaturesDraft;

const amendment = { id: 'draft:sms', kind: 'amend', baseLeafId: 'feat-pickup', materialisedAs: null };

describe('a value held on an amendment (ac-evo-wt-held)', () => {
	it('leaves the feature as it was and is read where it waits', () => {
		const saved = saveDossierField(features, { fieldPath: '05-functional.acceptance', leafId: 'draft:sms', value: 'One text per order at most.', canWriteCanonical: true });
		if (saved.status !== 'accepted') throw new Error('refused');
		expect(readDossierField(saved.draft, '05-functional.acceptance', 'feat-pickup').value).toBe('A bag is handed over only once ready.');
		expect(readTouchedField(saved.draft, { drafts: [amendment] }, '05-functional.acceptance', 'feat-pickup').value).toBe('One text per order at most.');
	});

	it('reads the feature itself once the amendment has landed', () => {
		expect(readTouchedField(features, { drafts: [{ ...amendment, materialisedAs: 'feat-pickup' }] }, '05-functional.acceptance', 'feat-pickup').value).toBe(
			'A bag is handed over only once ready.'
		);
	});
});

describe('a value a draft carries is validated like any answer [criterion:ac-leaf-d6560483-f523-41e6-929f-c4d928ac9832]', () => {
	// An addition named with its objective at its creation: nothing is written in the section yet.
	const request = {
		...createEvolutionRequest({ id: 'r1', stage: 'coherence', leafIds: ['draft:sub'] }),
		drafts: [{ id: 'draft:sub', kind: 'add', baseLeafId: null, materialisedAs: null, objective: 'Nothing to redo every week.', acceptanceCriteria: [] }]
	} as unknown as EvolutionRequest;

	it('reads the draft\'s value where the section holds none, as the card shows it', () => {
		expect(readTouchedField(features, request, '01-origin.objective', 'draft:sub').value).toBe('');
		expect(readHeldField(features, request, '01-origin.objective', 'draft:sub').value).toBe('Nothing to redo every week.');
	});

	it('lets a person stand behind it, recorded as the field\'s first version', () => {
		const ctx = { actor: { id: 'bo', kind: 'person', role: 'owner' }, at: '2026-10-22T00:00:00.000Z', newId: () => 'v1' } as unknown as Parameters<typeof validateFieldAct>[0];
		const key = '01-origin.objective@draft:sub';
		const outcome = validateFieldAct(ctx, request, { key, liveValue: readHeldField(features, request, '01-origin.objective', 'draft:sub').value });
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.request.fieldVersions.filter((v) => v.key === key).map((v) => v.value)).toEqual(['Nothing to redo every week.']);
		expect(outcome.request.fieldValidations.some((v) => v.key === key && v.by === 'bo')).toBe(true);
	});
});

describe('a behaviour criterion the amendment changes fills the Acceptance criteria answer [criterion:52c53f0c]', () => {
	const ctx = { actor: { id: 'bo', kind: 'person', role: 'owner' }, at: '2026-11-20T00:00:00.000Z', newId: () => 'v1' } as unknown as Parameters<typeof validateFieldAct>[0];
	const reword = (then: string) => ({ kind: 'update_acceptance_criterion', criterionId: 'd7cd4e43', patch: { then } });
	const amending = (operations: Record<string, unknown>[], base = 'feat-pickup') =>
		({
			...createEvolutionRequest({ id: 'r2', stage: 'coherence', leafIds: [base] }),
			drafts: [{ id: 'draft:hand', kind: 'amend', baseLeafId: base, materialisedAs: null, acceptanceCriteria: [], behaviourModel: { operations, mintedIds: [], updatedAt: 't' } }]
		}) as unknown as EvolutionRequest;
	// A feature whose criteria all live in its behaviour model: the section holds no text criterion.
	const bare = { ...features, leafMeta: {} } as unknown as ProjectFeaturesDraft;

	it('reads filled when the only acceptance change is a rewording in the behaviour model', () => {
		const request = amending([reword('the bag is handed over')], 'feat-pickup');
		const held = readHeldField(bare, request, '05-functional.acceptance', 'feat-pickup').value;
		expect(held).toBe('Rewords the criterion d7cd4e43 as then the bag is handed over');
	});

	it('reads an added and a retired behaviour criterion as acceptance changes too', () => {
		const request = amending([
			{ kind: 'add_acceptance_criterion', title: 'Ready bags only', given: 'a bag not ready', when: 'the customer asks for it', then: 'it is refused' },
			{ kind: 'remove_acceptance_criterion', criterionId: 'a1b2c3d4' }
		]);
		expect(readHeldField(bare, request, '05-functional.acceptance', 'feat-pickup').value.split('\n')).toEqual([
			'Adds the criterion "Ready bags only": given a bag not ready; when the customer asks for it; then it is refused',
			'Retires the criterion a1b2c3d4'
		]);
	});

	it('stands behind the text criteria and the behaviour changes, so a later change outdates the validation', () => {
		const request = amending([reword('the bag is handed over')]);
		const key = '05-functional.acceptance@feat-pickup';
		const before = readHeldField(features, request, '05-functional.acceptance', 'feat-pickup').value;
		expect(before).toBe('A bag is handed over only once ready.\nRewords the criterion d7cd4e43 as then the bag is handed over');
		const validated = validateFieldAct(ctx, request, { key, liveValue: before });
		expect(validated.ok).toBe(true);
		if (!validated.ok) return;
		// The criterion is reworded again on the draft: the value the validation stood behind is gone.
		const moved = { ...validated.request, drafts: amending([reword('the bag is handed over once paid')]).drafts };
		const after = readHeldField(features, moved, '05-functional.acceptance', 'feat-pickup').value;
		expect(after).not.toBe(before);
		expect(fieldValidationOf(moved, key, after).status).toBe('changed_outside');
	});

	it('leaves every other answer as the section holds it', () => {
		const request = amending([reword('the bag is handed over')]);
		expect(readHeldField(bare, request, '01-origin.objective', 'feat-pickup').value).toBe('');
	});
});

describe('the Acceptance criteria answer stands behind what the amendment lands [criterion:c0a6eef3]', () => {
	const ctx = { actor: { id: 'bo', kind: 'person', role: 'owner' }, at: '2026-11-20T00:00:00.000Z', newId: () => 'v1' } as unknown as Parameters<typeof validateFieldAct>[0];
	const team = { ...features, leafMeta: { 'feat-pickup': { objective: 'Hand bags over.', acceptanceCriteria: [{ id: 'c-team', text: 'Share the project names Small Team.' }, { id: 'c-old', text: 'An old promise.' }] } } } as unknown as ProjectFeaturesDraft;
	const amending = (fields: Record<string, unknown>) =>
		({
			...createEvolutionRequest({ id: 'r3', stage: 'coherence', leafIds: ['feat-pickup'] }),
			drafts: [{ id: 'draft:team', kind: 'amend', baseLeafId: 'feat-pickup', materialisedAs: null, acceptanceCriteria: [], ...fields }]
		}) as unknown as EvolutionRequest;
	const key = '05-functional.acceptance@feat-pickup';
	const answer = (request: EvolutionRequest) => readHeldField(team, request, '05-functional.acceptance', 'feat-pickup').value;

	it('reads the rewordings, the retirements and the additions the landing would write', () => {
		const request = amending({ changeCriteria: [{ id: 'c-team', text: 'Share the project names Team.' }], retireCriteria: ['c-old'], acceptanceCriteria: [{ id: 'n1', text: 'View plans opens the pricing.' }] });
		expect(answer(request).split('\n')).toEqual(['Share the project names Team.', 'View plans opens the pricing.']);
	});

	it('waits again once a criterion is reworded after the validation', () => {
		const first = amending({ changeCriteria: [{ id: 'c-team', text: 'Share the project names Small Team.' }] });
		const validated = validateFieldAct(ctx, first, { key, liveValue: answer(first) });
		expect(validated.ok).toBe(true);
		if (!validated.ok) return;
		const reworded = { ...validated.request, drafts: amending({ changeCriteria: [{ id: 'c-team', text: 'Share the project names Team.' }] }).drafts };
		expect(fieldValidationOf(reworded, key, answer(reworded)).status).toBe('changed_outside');
		// Validating again records the new version instead of answering it was already validated.
		const again = validateFieldAct(ctx, reworded, { key, liveValue: answer(reworded) });
		expect(again.ok).toBe(true);
		if (!again.ok) return;
		expect(again.request.fieldVersions.filter((v) => v.key === key)).toHaveLength(2);
	});

	it('reads a value typed on the draft before the feature\'s own, as the landing writes it', () => {
		expect(readHeldField(team, amending({ objective: 'Hand only paid bags over.' }), '01-origin.objective', 'feat-pickup').value).toBe('Hand only paid bags over.');
		expect(readHeldField(team, amending({ objective: '' }), '01-origin.objective', 'feat-pickup').value).toBe('Hand bags over.');
	});
});
