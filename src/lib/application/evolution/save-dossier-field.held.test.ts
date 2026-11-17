import { describe, expect, it } from 'vitest';
import { readDossierField, readHeldField, readTouchedField, saveDossierField } from './save-dossier-field';
import { createEvolutionRequest, validateFieldAct, type EvolutionRequest } from '$domain/evolution';
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
