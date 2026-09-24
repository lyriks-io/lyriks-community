import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest } from './draft';
import { materialiseDrafts, type Tree } from './materialise';

/**
 * What a person SIGNED is what the feature carries.
 *
 * Proven on the studio on 2026-09-23 (source src-studio-test-2026-09-59): a draft
 * opened with a problem and a value, then signed with different text for both,
 * produced a feature carrying the DRAFT's text. Two of four signed values never
 * reached the tree, and nothing on screen said which of the two had been kept.
 */
const AT = '2026-09-23T12:00:00.000Z';

const treeWith = (leafMeta: Tree['leafMeta'], features: Tree['features'] = []): Tree => ({
	cores: [{ id: 'core-1' }],
	features,
	leafMeta
});

describe('a signed value beats the text typed on the draft', () => {
	it('writes the signed objective, problem and value, not the draft ones', () => {
		const draft = createDraftLeaf({
			id: 'draft:d1',
			kind: 'add',
			name: 'Rappel de la veille',
			coreId: 'core-1',
			objective: 'TYPED objective',
			problem: 'TYPED problem',
			value: 'TYPED value'
		});
		const request = createEvolutionRequest({ id: 'r1', drafts: [draft], leafIds: ['draft:d1'] });
		const tree = treeWith({
			'draft:d1': {
				objective: 'SIGNED objective',
				problem: 'SIGNED problem',
				value: 'SIGNED value'
			}
		});

		const { features } = materialiseDrafts(tree, request, AT);
		const created = features.features.find((f) => f.name === 'Rappel de la veille');
		expect(created).toBeDefined();
		const meta = features.leafMeta?.[created!.id];
		expect(meta?.objective).toBe('SIGNED objective');
		expect(meta?.problem).toBe('SIGNED problem');
		expect(meta?.value).toBe('SIGNED value');
	});

	it('falls back to the draft text for a field nobody signed', () => {
		const draft = createDraftLeaf({
			id: 'draft:d2',
			kind: 'add',
			name: 'Sans signature',
			coreId: 'core-1',
			objective: 'TYPED objective',
			problem: 'TYPED problem'
		});
		const request = createEvolutionRequest({ id: 'r2', drafts: [draft], leafIds: ['draft:d2'] });
		const tree = treeWith({ 'draft:d2': { objective: 'SIGNED objective' } });

		const { features } = materialiseDrafts(tree, request, AT);
		const created = features.features.find((f) => f.name === 'Sans signature');
		const meta = features.leafMeta?.[created!.id];
		expect(meta?.objective).toBe('SIGNED objective');
		expect(meta?.problem).toBe('TYPED problem');
	});

	it('lets a signed criteria list replace the typed one instead of joining it', () => {
		const draft = createDraftLeaf({
			id: 'draft:d3',
			kind: 'add',
			name: 'Criteres',
			coreId: 'core-1',
			acceptanceCriteria: [{ id: 'c-typed', text: 'Le rappel porte le lien pour annuler.' }]
		});
		const request = createEvolutionRequest({ id: 'r3', drafts: [draft], leafIds: ['draft:d3'] });
		const tree = treeWith({
			'draft:d3': {
				acceptanceCriteria: [
					{ id: 'c-signed', text: 'Le rappel porte le moyen d’annuler en un geste.' }
				]
			}
		});

		const { features } = materialiseDrafts(tree, request, AT);
		const created = features.features.find((f) => f.name === 'Criteres');
		const texts = (features.leafMeta?.[created!.id]?.acceptanceCriteria ?? []).map((c) => c.text);
		expect(texts).toEqual(['Le rappel porte le moyen d’annuler en un geste.']);
	});

	it('still keeps the criteria an amended feature already carried', () => {
		const draft = createDraftLeaf({
			id: 'draft:d4',
			kind: 'amend',
			baseLeafId: 'feat-existing',
			name: 'Existante',
			coreId: 'core-1',
			acceptanceCriteria: [{ id: 'c-new', text: 'Une ligne de plus.' }]
		});
		const request = createEvolutionRequest({ id: 'r4', drafts: [draft], leafIds: ['draft:d4'] });
		const tree = treeWith(
			{ 'feat-existing': { acceptanceCriteria: [{ id: 'c-old', text: 'La ligne d’origine.' }] } },
			[
				{
					id: 'feat-existing',
					name: 'Existante',
					coreId: 'core-1',
					parentFamilyId: null,
					description: '',
					unspaghettitFeatureId: 'feat-existing'
				}
			]
		);

		const { features } = materialiseDrafts(tree, request, AT);
		const texts = (features.leafMeta?.['feat-existing']?.acceptanceCriteria ?? []).map((c) => c.text);
		expect(texts).toEqual(['La ligne d’origine.', 'Une ligne de plus.']);
	});

	it('keeps one line when the same criterion differs only by case, spacing or final stop', () => {
		const draft = createDraftLeaf({
			id: 'draft:d5',
			kind: 'amend',
			baseLeafId: 'feat-dup',
			name: 'Doublon',
			coreId: 'core-1',
			acceptanceCriteria: [{ id: 'c-retyped', text: 'un  rappel part  la veille a 18h' }]
		});
		const request = createEvolutionRequest({ id: 'r5', drafts: [draft], leafIds: ['draft:d5'] });
		const tree = treeWith(
			{ 'feat-dup': { acceptanceCriteria: [{ id: 'c-first', text: 'Un rappel part la veille a 18h.' }] } },
			[
				{
					id: 'feat-dup',
					name: 'Doublon',
					coreId: 'core-1',
					parentFamilyId: null,
					description: '',
					unspaghettitFeatureId: 'feat-dup'
				}
			]
		);

		const { features } = materialiseDrafts(tree, request, AT);
		const texts = (features.leafMeta?.['feat-dup']?.acceptanceCriteria ?? []).map((c) => c.text);
		expect(texts).toEqual(['Un rappel part la veille a 18h.']);
	});
});

describe('the freeze says which criteria the feature already carried', () => {
	const amendRepeating = (texts: readonly string[]) => {
		const draft = createDraftLeaf({
			id: 'draft:r1',
			kind: 'amend',
			baseLeafId: 'feat-held',
			name: 'Tenue',
			coreId: 'core-1',
			acceptanceCriteria: texts.map((text, i) => ({ id: `c-draft-${i}`, text }))
		});
		const request = createEvolutionRequest({ id: 'rr', drafts: [draft], leafIds: ['draft:r1'] });
		const tree = treeWith(
			{
				'feat-held': {
					acceptanceCriteria: [
						{ id: 'c-held-1', text: 'La ligne que la feature porte deja.' },
						{ id: 'c-held-2', text: 'Une deuxieme ligne tenue.' }
					]
				}
			},
			[
				{
					id: 'feat-held',
					name: 'Tenue',
					coreId: 'core-1',
					parentFamilyId: null,
					description: '',
					unspaghettitFeatureId: 'feat-held'
				}
			]
		);
		return materialiseDrafts(tree, request, AT);
	};

	it('counts the repeats and says the feature id is what survived', () => {
		const out = amendRepeating([
			'La ligne que la feature porte deja.',
			'  une DEUXIEME ligne tenue  ',
			'Une ligne vraiment nouvelle.'
		]);
		expect(out.lines.join(' ')).toContain('2 acceptance criteria it already carried');
		expect(out.lines.join(' ')).toContain('kept the id the feature gave it');
		const ids = (out.features.leafMeta?.['feat-held']?.acceptanceCriteria ?? []).map((c) => c.id);
		expect(ids).toEqual(['c-held-1', 'c-held-2', 'c-draft-2']);
	});

	it('says nothing when the draft repeated none of them', () => {
		const out = amendRepeating(['Une ligne vraiment nouvelle.']);
		expect(out.lines.join(' ')).not.toContain('already carried');
	});

	it('speaks of one criterion in the singular', () => {
		const out = amendRepeating(['La ligne que la feature porte deja.']);
		expect(out.lines.join(' ')).toContain('1 acceptance criterion it already carried');
	});
});
