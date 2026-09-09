import { describe, expect, it } from 'vitest';
import { createDocumentSource, createEmptyDocumentsDraft } from '$domain/documents';
import {
	createEmptyArchitectureDraft,
	createReferenceDoc,
	type ProjectArchitectureDraft
} from '$domain/architecture';
import { foldLegacyReferenceDocs, LoadDocumentRegisterUseCase } from './load-document-register';

describe('folding legacy architecture reference docs into the register', () => {
	const legacy = createReferenceDoc({
		id: 'doc-stripe',
		title: 'Stripe · Payment Intents',
		url: 'https://stripe.com/docs',
		kind: 'legal',
		description: 'The API contract we build against.'
	});

	it('publishes a legacy doc as a register row, keeping its id so citations resolve', () => {
		const [folded] = foldLegacyReferenceDocs([], [legacy]);
		expect(folded).toMatchObject({
			id: 'doc-stripe',
			title: 'Stripe · Payment Intents',
			url: 'https://stripe.com/docs',
			// architecture's `legal` maps onto the register's vocabulary
			kind: 'regulation',
			note: 'The API contract we build against.'
		});
	});

	it('is idempotent: once the register owns the id, the legacy copy is dropped', () => {
		const registered = createDocumentSource({ id: 'doc-stripe', title: 'Stripe (edited)' });
		const folded = foldLegacyReferenceDocs([registered], [legacy]);
		expect(folded).toHaveLength(1);
		// The editable register row wins — the legacy copy never overwrites edits.
		expect(folded[0].title).toBe('Stripe (edited)');
	});

	it('leaves a register with no legacy docs exactly as it is', () => {
		const registered = [createDocumentSource({ id: 'a' }), createDocumentSource({ id: 'b' })];
		expect(foldLegacyReferenceDocs(registered, []).map((s) => s.id)).toEqual(['a', 'b']);
	});
});

describe('the register every reader shares', () => {
	const architecture = (docs: ProjectArchitectureDraft['referenceDocs']) => ({
		load: async () => ({ ...createEmptyArchitectureDraft('p1'), referenceDocs: docs })
	});

	it('serves the Documents page and the citation pickers the SAME rows', async () => {
		// The bug this pins: the page read the raw section while the pickers read
		// the fold, so a legacy doc appeared in every picker but nowhere on the page.
		const legacy = createReferenceDoc({ id: 'doc-react', title: 'React documentation' });
		const useCase = new LoadDocumentRegisterUseCase(
			{ load: async () => ({ ...createEmptyDocumentsDraft('p1'), sources: [] }) },
			architecture([legacy])
		);

		const register = await useCase.execute('p1');

		expect(register.sources.map((s) => s.id)).toEqual(['doc-react']);
	});

	it('returns a usable draft for a project that has never saved either section', async () => {
		const useCase = new LoadDocumentRegisterUseCase(
			{ load: async () => null },
			{ load: async () => null }
		);

		await expect(useCase.execute('p1')).resolves.toMatchObject({ projectId: 'p1', sources: [] });
	});
});
