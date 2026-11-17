import { describe, expect, it } from 'vitest';
import { NBSP } from '$domain/language';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { addDraftLeafAct, openRequestAct, setDraftBehaviourModelAct, type ActContext, type ActOutcome } from './acts';
import { propagateImpact, reachedSentence } from './impact-propagation';
import { draftCoherence } from './overlay';
import { deriveImplementationReport } from './report-derivation';
import { deriveCodeImpact, emptyImpactReason, impactInPlainWords, impactSummaryLine, isNothingMovesLine } from './code-impact';
import { reachLabel, reachMeaning } from './impact';
import { lineBrief } from './implementation';
import { materialiseDrafts } from './materialise';
import { withSolutionValidated } from './solution-validated.fixture';

/**
 * Every text the dossier writes about the model follows the language of the
 * spec (382e5227): French when the spec is French, names quoted as they are,
 * French typography kept. English is what a caller gets without a language.
 */

const q = (name: string) => `«${NBSP}${name}${NBSP}»`;

const graph = {
	nodes: [
		{ id: 'feature:feat-a', kind: 'feature', label: 'Paiement' },
		{ id: 'screen:s1', kind: 'screen', label: 'Panier' },
		{ id: 'entity:e1', kind: 'entity', label: 'Commande' },
		{ id: 'rule:r1', kind: 'rule', label: 'Total jamais négatif' },
		{ id: 'term:t1', kind: 'term', label: 'Panier' }
	],
	edges: [
		{ from: 'feature:feat-a', to: 'screen:s1', kind: 'contains' },
		{ from: 'screen:s1', to: 'entity:e1', kind: 'reads' },
		{ from: 'rule:r1', to: 'feature:feat-a', kind: 'derives' }
	]
};

describe('impact notes in French', () => {
	it('says why a node is reached, with the names in guillemets', () => {
		expect(reachedSentence(['Paiement'], 1, 'depends_on', 'fr')).toBe(`À côté de ${q('Paiement')}${NBSP}: l'un dépend de l'autre.`);
		expect(reachedSentence(['Paiement', 'Panier'], 2, 'reads', 'fr')).toBe(
			`Repose sur ${q('Panier')}, qui est à côté de ${q('Paiement')}.`
		);
		expect(reachedSentence(['A', 'B', 'C'], 3, 'reads', 'fr')).toBe(`Repose sur ${q('C')}, à 3 liens de ${q('A')}.`);
		expect(reachedSentence(['X'], 1, 'some_new_link', 'fr')).toBe(`À côté de ${q('X')}${NBSP}: reliés par ${q('some new link')}.`);
	});

	it('stores the notes of a walk in French, the glossary note too', () => {
		const request = createEvolutionRequest({ id: 'req-1', leafIds: ['feat-a'] });
		const findings = propagateImpact({
			request,
			hypothesis: 'change',
			depth: 2,
			graph,
			terms: [{ id: 't1', term: 'Panier' }],
			lang: 'fr'
		});
		expect(findings.find((f) => f.nodeId === 'entity:e1')?.note).toBe(
			`Repose sur ${q('Panier')}, qui est à côté de ${q('Paiement')}.`
		);
		expect(findings.find((f) => f.nodeId === 'term:t1')?.note).toContain(`déplace${NBSP}; vérifiez`);
	});

	it('says the whole reading in French, counts agreeing', () => {
		const request = createEvolutionRequest({ id: 'req-1', leafIds: ['feat-a'] });
		const change = propagateImpact({ request, hypothesis: 'change', depth: 2, graph, lang: 'fr' });
		expect(impactSummaryLine(change, 'change', 'fr')).toBe(
			'1 écran à retravailler, 1 règle à réécrire, 1 entité qui peut migrer, 1 nœud plus loin à revérifier.'
		);
		expect(impactSummaryLine([], 'add', 'fr')).toBe(
			`Rien de ce qui existe ne bouge${NBSP}: l'ajout se fait à l'intérieur des fonctionnalités touchées.`
		);
		const plain = impactInPlainWords(change, 'change', 'fr');
		expect(plain[0]).toBe(`1 écran ou parcours à retravailler${NBSP}: ${q('Panier')}.`);
		expect(plain).toContain(`1 entité ou champ à migrer si sa forme change${NBSP}: ${q('Commande')}.`);
		expect(isNothingMovesLine(impactInPlainWords([], 'add', 'fr')[0])).toBe(true);
	});

	it('writes the code plane notes in French', () => {
		const request = createEvolutionRequest({ id: 'req-1', leafIds: ['feat-a'] });
		const [file] = deriveCodeImpact({
			request,
			hypothesis: 'change',
			statuses: {
				'feat-a': {
					actions: [
						{
							foundEntities: [
								{ entityType: 'action', entityId: 'a1', entityName: 'Payer', locations: [{ file: 'src/pay.ts' }] },
								{ entityType: 'rule', entityId: 'r1', entityName: 'Carte valide', locations: [{ file: 'src/pay.ts' }] }
							]
						}
					]
				}
			},
			depthByFeature: { 'feat-a': 1 },
			leafNames: { 'feat-a': 'Paiement' },
			lang: 'fr'
		});
		expect(file.note).toBe(
			`2 éléments de ${q('Paiement')} se trouvent ici${NBSP}: action ${q('Payer')}, rule ${q('Carte valide')}.`
		);
		expect(impactInPlainWords([file], 'change', 'fr')).toContain(
			`1 fichier sur 1 fonctionnalité${NBSP}: 1 à modifier, 0 à risque.`
		);
	});

	it('says why a report is empty in French', () => {
		const draft = { kind: 'add', name: 'Export', dependsOn: [], behaviour: [], acceptanceCriteria: [] };
		expect(emptyImpactReason({ leafIds: ['draft:1'], drafts: [draft] }, 'fr')).toContain(
			`${q('Export')} ne déclare aucune dépendance`
		);
		expect(emptyImpactReason({ leafIds: [], drafts: [] }, 'fr')).toBe(
			"La demande ne nomme encore aucune fonctionnalité, il n'y a donc rien d'où partir."
		);
	});

	it('explains a distance in French', () => {
		expect(reachLabel(2, 'fr')).toBe('par ricochet');
		expect(reachMeaning(4, 'fr')).toContain('atteint par 3 liens');
	});
});

describe('draft coherence titles in French', () => {
	it('names both sides in guillemets', () => {
		const request = createEvolutionRequest({
			id: 'req-1',
			leafIds: ['draft:x'],
			drafts: [
				{
					id: 'draft:x',
					kind: 'add',
					baseLeafId: null,
					name: 'Paiement',
					description: 'Utilise le caddie.',
					coreId: null,
					parentFamilyId: null,
					objective: '',
					problem: '',
					expectedEffect: '',
					value: '',
					acceptanceCriteria: [],
					dependsOn: [],
					sourceIds: [],
					behaviour: [],
					materialisedAs: null,
					materialisedAt: null
				}
			] as never
		});
		const titles = draftCoherence({
			request,
			leafNames: { 'feat-a': 'Paiement' },
			dependsOn: {},
			bannedWords: [{ avoid: 'caddie', prefer: 'panier' }],
			lang: 'fr'
		}).map((f) => f.title);
		expect(titles).toEqual([
			`${q('Paiement')} est déjà le nom d'une fonctionnalité existante`,
			`${q('Paiement')} emploie ${q('caddie')}, que le glossaire demande d'appeler ${q('panier')}`,
			`${q('Paiement')} ne porte aucun critère d'acceptation, donc rien ne dit quand le travail est terminé`
		]);
	});
});

describe('implementation report in French', () => {
	const request = { id: 'req-1', iteration: 1, specVersion: 2, leafIds: ['feat-a'] };
	it('states what the spec declares and what the code does', () => {
		const lines = deriveImplementationReport({
			request,
			statuses: {
				'feat-a': {
					actions: [
						{
							actionName: 'Payer',
							expectedEntities: [{ entityType: 'rule', entityId: 'r1', entityName: 'Carte valide' }],
							missingEntities: [{ entityType: 'rule', entityId: 'r1', entityName: 'Carte valide' }],
							extraTags: [{ tag: '@unspa:pay#remise' }]
						}
					]
				}
			},
			neighbours: {},
			leafNames: { 'feat-a': 'Paiement' },
			lang: 'fr'
		});
		const missing = lines.find((l) => l.verdict === 'missing')!;
		expect(missing.requirement).toBe(`Paiement › Payer › rule ${q('Carte valide')}`);
		expect(missing.specStatement).toBe(`La spec déclare l'élément rule ${q('Carte valide')} pour ${q('Payer')}.`);
		expect(missing.codeStatement).toBe("Rien n'a été localisé pour cet élément dans l'index synchronisé.");
		const extra = lines.find((l) => l.verdict === 'out_of_scope')!;
		expect(extra.specStatement).toBe('Rien dans la spec ne demande cela.');
		expect(extra.codeStatement).toBe('Le code porte la balise @unspa:pay#remise.');

		const r = createEvolutionRequest({ title: 'Remises', specVersion: 2, implementationFindings: lines });
		const brief = lineBrief(r, missing, 'fr');
		expect(brief.split('\n')[0]).toBe(`Demande${NBSP}: Remises (itération 1, version de spec 2)`);
		expect(brief).toContain(`[manquant]`);
		expect(brief).toContain(`À faire${NBSP}: L'implémenter${NBSP}: rien n'a été localisé pour cette exigence.`);
		expect(brief).toContain(`Laisser intact${NBSP}: rien n'est encore conforme.`);
	});
});

describe('timeline and freeze lines in French', () => {
	const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
	let n = 0;
	const ctx: ActContext = { actor: person, at: '2026-09-29T00:00:00.000Z', newId: () => `id-${++n}`, lang: 'fr' };
	const ok = (outcome: ActOutcome): EvolutionRequest => {
		if (!outcome.ok) throw new Error(outcome.reason);
		return outcome.request;
	};

	it('records the acts in French, and a stored English summary keeps its language', () => {
		const english = ok(
			openRequestAct({ ...ctx, lang: undefined }, {
				title: 'Remises',
				origin: 'customer_feedback',
				requester: 'ana',
				leafIds: ['feat-a'],
				knownLeafIds: new Set(['feat-a'])
			})
		);
		const drafted = ok(addDraftLeafAct(ctx, withSolutionValidated(english), { name: 'Remise fidélité' }, new Set(['feat-a'])));
		const closed = ok(setDraftBehaviourModelAct(ctx, drafted, drafted.drafts[0].id, null));
		const summaries = closed.history.map((h) => h.summary);
		expect(summaries).toContain('Request opened in specification');
		expect(summaries).toContain(`Brouillon${NBSP}: ajout de ${q('Remise fidélité')}`);
		expect(summaries).toContain(`Modèle de comportement de ${q('Remise fidélité')} effacé`);
	});

	it('says what the freeze wrote in French', () => {
		const request = ok(
			addDraftLeafAct(
				ctx,
				withSolutionValidated(
					ok(
						openRequestAct(ctx, {
							title: 'Remises',
							origin: 'customer_feedback',
							requester: 'ana',
							leafIds: ['feat-a'],
							knownLeafIds: new Set(['feat-a'])
						})
					)
				),
				{ name: 'Remise fidélité', coreId: 'c1' },
				new Set(['feat-a'])
			)
		);
		const tree = { features: [{ id: 'feat-a', name: 'Paiement', coreId: 'c1', parentFamilyId: null }], leafMeta: {} };
		const written = materialiseDrafts(tree as never, request, ctx.at, 'fr');
		expect(written.lines[0]).toMatch(new RegExp(`^Fonctionnalité ${q('Remise fidélité')} \\(.+\\) créée depuis la demande `));
	});
});
