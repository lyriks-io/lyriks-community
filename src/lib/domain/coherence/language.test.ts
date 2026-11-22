import { describe, expect, it } from 'vitest';
import { applyDecisions, settleGap } from './decisions';
import { keepActionablePreparations } from './prepared';
import { createEmptyCoherenceDraft, type Gap } from './draft';
import { computeCoherenceLocal } from './coherence';
import { missingCoherenceRequirements } from './can-advance';
import { countOf, sectionTone } from './section-tone';
import { computeFeaturesCoherence, createEmptyFeaturesDraft } from '$domain/features';
import { computeGlossaryCoherence, createEmptyGlossaryDraft } from '$domain/glossary';

const gap = (title: string): Gap => ({
	id: 'gap-glossary-unapproved-terms',
	checkId: 'glossary.approved',
	severity: 'low',
	title,
	detail: '',
	sourceStep: 'glossary',
	blocking: false
});
const person = { id: 'ana@example.com', kind: 'person' as const };

describe('a gap keeps its decision when its text changes language (382e5227)', () => {
	it('settles and prepares by key, the stored title being a display copy', () => {
		const english = gap('2 terms are waiting for approval');
		const french = gap('2 termes attendent une approbation');
		let draft = settleGap(
			createEmptyCoherenceDraft('p'),
			{ gapId: english.id, gapTitle: english.title, status: 'by_design', reason: 'Draft on purpose', author: person },
			'd1',
			'2026-09-30T10:00:00.000Z'
		);
		const applied = applyDecisions({ dimensions: [], gaps: [french], readinessScore: 0 }, draft);
		expect(applied.gaps).toEqual([]);
		expect(applied.settled?.[0].gap.title).toBe('2 termes attendent une approbation');
		expect(applied.settled?.[0].decision.gapTitle).toBe('2 terms are waiting for approval');

		const prepared = [{ id: 'p1', gapId: english.id, gapTitle: english.title, status: 'accepted_risk' as const, reason: 'Cheap', preparedById: person.id, preparedByKind: person.kind, preparedAt: '2026-09-30T10:00:00.000Z' }];
		expect(keepActionablePreparations(prepared, { gaps: [french] })).toHaveLength(1);
	});
});

describe('section texts in the spec language', () => {
	it('keeps English byte-identical by default and writes French on demand', () => {
		const features = createEmptyFeaturesDraft('p');
		expect(computeFeaturesCoherence(features).issues[0].message).toBe('No Core authored yet.');
		expect(computeFeaturesCoherence(features, 'fr').issues[0].message).toBe("Aucun domaine (Core) n'est encore rédigé.");
		expect(computeFeaturesCoherence(features, 'fr').label).toBe('Critique');
		expect(computeGlossaryCoherence(createEmptyGlossaryDraft('p'), 'fr').issues[0].message).toBe(
			"Aucun terme n'est encore gouverné. Ajoutez le premier terme."
		);
		expect(sectionTone(50)).toEqual({ tone: 'at-risk', label: 'At risk' });
		expect(sectionTone(80, 'fr')).toEqual({ tone: 'strong', label: 'Solide' });
		expect(countOf('fr', 0, 'rôle', 'rôles')).toBe('0 rôle');
		expect(countOf('en', 0, 'role', 'roles')).toBe('0 roles');
	});

	it('writes the Step 09 chip and its requirements in French', () => {
		const draft = createEmptyCoherenceDraft('p');
		const analysis = { dimensions: [], gaps: [gap('x')], readinessScore: 40 };
		expect(computeCoherenceLocal(draft, analysis, 'fr').issues.map((i) => i.message)).toContain(
			'Les spécifications ne sont pas encore générées.'
		);
		expect(missingCoherenceRequirements(draft, analysis, 'fr')).toContain('générer les spécifications');
		expect(missingCoherenceRequirements(draft, analysis)).toContain('generate the specifications');
	});
});
