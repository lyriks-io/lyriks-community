import { describe, expect, it } from 'vitest';
import { featureOfLink, trailingLink, withLink } from './diagram-links';
import { readFunctionalDiagram, writeFunctionalDiagram, functionalDiagramWords } from './functional-diagram';
import { linkStep, linkUseCase, renameUseCase } from './functional-diagram-edits';
import { readTechnicalDiagram, writeTechnicalDiagram } from './technical-diagram';
import { linkTechElement, updateTechElement } from './technical-diagram-edits';
import { functionalLinks, goneLinkProblems, usedFeatures } from './used-features';
import { propagateImpact, type PropagationGraph } from './impact-propagation';
import { impactInPlainWords, impactSummaryLine } from './code-impact';
import { linkCandidates, pickLinks } from './diagram-link-candidates';
import { createEvolutionRequest } from './draft';
import type { GraphEdge, GraphNode } from '$domain/graph';

const ORDER = { name: 'Commander en ligne', ref: 'feature:feat-order' };
const VALIDATE = { name: 'Valider la commande', ref: 'action:feat-order/2247d7b5' };
const TABLE = { name: 'Commande', ref: 'entity:ent-commande' };

describe('a link is the citation an element line ends on', () => {
	it('splits the line from the link, and names the feature it stands on', () => {
		expect(trailingLink('Product: valide la commande @[Valider la commande](action:feat-order/2247d7b5)')).toEqual({ rest: 'Product: valide la commande', link: VALIDATE });
		expect(trailingLink('Product: valide la commande')).toEqual({ rest: 'Product: valide la commande', link: null });
		// A citation of another kind is prose, not a link.
		expect(trailingLink('Client: lit @[Panier](screen:0ab8000a)').link).toBeNull();
		expect(featureOfLink(ORDER.ref)).toBe('feat-order');
		expect(featureOfLink(VALIDATE.ref)).toBe('feat-order');
		expect(featureOfLink(TABLE.ref)).toBeNull();
		expect(featureOfLink('action:2247d7b5')).toBeNull();
		expect(withLink({ name: 'x', link: ORDER }, null)).toEqual({ name: 'x' });
	});
});

describe('a use case or a step is linked to what the product already has [criterion:ac-leaf-ac-evo-func-uml-link]', () => {
	const notation = [
		'actor Client',
		'',
		'use case Payer sa commande: Client @[Commander en ligne](feature:feat-order)',
		'',
		'flow Payer sa commande',
		'  Client: paie en ligne',
		'  Product: valide la commande @[Valider la commande](action:feat-order/2247d7b5)',
		'    refused when le paiement est refusé: la commande reste en brouillon'
	].join('\n');

	it('reads the link of a use case and of a step, and writes them back where they were', () => {
		const { diagram, problems } = readFunctionalDiagram(notation);
		expect(problems).toEqual([]);
		expect(diagram.useCases[0]).toEqual({ name: 'Payer sa commande', actors: ['Client'], link: ORDER });
		expect(diagram.flows[0].steps[1]).toMatchObject({ lane: 'Product', text: 'valide la commande', link: VALIDATE });
		expect(diagram.flows[0].steps[0].link).toBeUndefined();
		expect(writeFunctionalDiagram(diagram)).toBe(notation);
	});

	it('keeps the link out of the words the glossary reads', () => {
		expect(functionalDiagramWords(notation)).not.toContain('feat-order');
	});

	it('points out a link to what the product no longer has, on its element, and never one not known yet', () => {
		const { diagram } = readFunctionalDiagram(notation);
		const links = functionalLinks(diagram);
		const problems = goneLinkProblems(links, (ref) => (ref === VALIDATE.ref ? null : ref === ORDER.ref ? undefined : '/x'));
		expect(problems).toEqual([
			{ line: null, message: '"Valider la commande" is no longer in the product: link it again, or take the link off.', at: [{ kind: 'step', useCase: 'Payer sa commande', index: 1 }] }
		]);
	});

	it('links and unlinks from the fields, and a rename keeps the link', () => {
		const { diagram } = readFunctionalDiagram(notation);
		const bare = linkStep(linkUseCase(diagram, 'Payer sa commande', null), 'Payer sa commande', 1, null);
		expect(writeFunctionalDiagram(bare)).not.toContain('@[');
		const renamed = renameUseCase(diagram, 'Payer sa commande', 'Régler sa commande');
		expect(renamed.useCases[0].link).toEqual(ORDER);
	});
});

describe('a component or a store is linked to what the product already has [criterion:ac-leaf-ac-evo-tech-uml-link]', () => {
	it('reads a linked part as already there, and says when it was also marked new', () => {
		const { diagram, problems } = readTechnicalDiagram(['component Service des commandes @[Commander en ligne](feature:feat-order)', 'store Commandes: new @[Commande](entity:ent-commande)'].join('\n'));
		expect(diagram.elements).toEqual([
			{ name: 'Service des commandes', kind: 'component', isNew: false, link: ORDER },
			{ name: 'Commandes', kind: 'store', isNew: false, link: TABLE }
		]);
		expect(problems.map((p) => p.message)).toEqual(['"Commandes" is linked to "Commande", which the product already has: it is not new.']);
		expect(writeTechnicalDiagram(diagram)).toBe('component Service des commandes @[Commander en ligne](feature:feat-order)\nstore Commandes @[Commande](entity:ent-commande)');
	});

	it('takes the new mark off when linking, and the link off when the part turns new or changes kind', () => {
		const start = readTechnicalDiagram('component Paiement: new').diagram;
		const linked = linkTechElement(start, 'Paiement', ORDER);
		expect(linked.elements[0]).toEqual({ name: 'Paiement', kind: 'component', isNew: false, link: ORDER });
		expect(updateTechElement(linked, 'Paiement', { isNew: true }).elements[0].link).toBeUndefined();
		expect(updateTechElement(linked, 'Paiement', { kind: 'store' }).elements[0].link).toBeUndefined();
		expect(updateTechElement(linked, 'Paiement', { kind: 'component' }).elements[0].link).toEqual(ORDER);
	});
});

describe('what the change uses as it stands [criterion:ac-leaf-ac-evo-imp-used]', () => {
	const request = (functional: string, technical = '', leafIds: string[] = []) => {
		const r = createEvolutionRequest({ id: 'r1', stage: 'coherence', leafIds });
		return { ...r, stepAnswers: { ...r.stepAnswers, functional_spec: { diagram: functional }, technical_spec: { diagram: technical } } };
	};

	it('collects each linked feature once, with the diagrams that use it, an action standing for its feature', () => {
		const r = request(
			'use case Payer: Client @[Commander en ligne](feature:feat-order)\nflow Payer\n  Product: valide @[Valider la commande](action:feat-pickup/a1)',
			'component Paiement @[Commander en ligne](feature:feat-order)\nstore Commandes @[Commande](entity:ent-commande)'
		);
		expect(usedFeatures(r)).toEqual([
			{ featureId: 'feat-order', diagrams: ['functional_spec', 'technical_spec'] },
			{ featureId: 'feat-pickup', diagrams: ['functional_spec'] }
		]);
	});

	it('never counts a feature the request already touches, nor a diagram of a step set aside', () => {
		const r = request('use case Payer: Client @[Commander en ligne](feature:feat-order)', '', ['feat-order']);
		expect(usedFeatures(r)).toEqual([]);
		const skipped = { ...request('use case Payer: Client @[Commander en ligne](feature:feat-order)'), skippedSteps: [{ step: 'functional_spec' as const, reason: 'small', by: 'x', at: '' }] };
		expect(usedFeatures(skipped)).toEqual([]);
	});

	it('starts the impact walk from a used feature too', () => {
		const graph: PropagationGraph = {
			nodes: [
				{ id: 'feature:feat-new', kind: 'feature', label: 'Payer en ligne' },
				{ id: 'feature:feat-order', kind: 'feature', label: 'Commander en ligne' },
				{ id: 'entity:ent-commande', kind: 'entity', label: 'Commande' }
			],
			edges: [{ from: 'feature:feat-order', to: 'entity:ent-commande', kind: 'reads' }]
		};
		const walk = (usedLeafIds?: string[]) => propagateImpact({ request: { id: 'r1', leafIds: ['feat-new'] }, hypothesis: 'change', depth: 2, graph, usedLeafIds });
		expect(walk().some((f) => f.nodeId === 'entity:ent-commande')).toBe(false);
		// One link away from the change: what rests on a used feature is reached further, never edited.
		const reached = walk(['feat-order']).find((f) => f.nodeId === 'entity:ent-commande');
		expect(reached).toMatchObject({ depth: 2, fromLeafId: 'feat-order', note: 'Rests on "Commander en ligne", which the change uses as it stands.' });
		// The plain lines say it apart, never with the verb of what the change edits.
		const plain = impactInPlainWords(walk(['feat-order']), 'change', 'fr');
		expect(plain[0]).toMatch(/^1 élément repose sur ce que le changement utilise tel quel, à revérifier\s:\s«\sCommande\s»\.$/);
		expect(impactSummaryLine(walk(['feat-order']), 'change')).toBe('1 node further out to check again.');
	});
});

describe('what an element may be linked to, read off the knowledge graph [criterion:ac-leaf-ac-evo-func-uml-link]', () => {
	const node = (id: string, kind: GraphNode['kind'], context: GraphNode['context'], label: string): GraphNode => ({ id, kind, context, label });
	const edge = (from: string, to: string): GraphEdge => ({ id: `${from}->${to}`, from, to, kind: 'contains' });
	const graph = {
		nodes: [
			node('feature:feat-order', 'feature', 'features', 'Commander en ligne'),
			node('feature:beh:feat-order', 'feature', 'behavior', 'Commander en ligne'),
			node('surface:s1', 'surface', 'behavior', 'Panier'),
			node('action:a1', 'action', 'behavior', 'Valider la commande'),
			node('entity:ent-commande', 'entity', 'data', 'Commande')
		],
		edges: [edge('feature:beh:feat-order', 'surface:s1'), edge('surface:s1', 'action:a1')]
	};
	const all = linkCandidates(graph, (n) => `/open/${n.id}`);

	it('offers each feature, each action with the feature that holds it, and each table', () => {
		expect(all).toEqual([
			{ ref: 'feature:feat-order', kind: 'feature', name: 'Commander en ligne', href: '/open/feature:feat-order' },
			{ ref: 'action:feat-order/a1', kind: 'action', name: 'Valider la commande', owner: 'Commander en ligne', href: '/open/feature:beh:feat-order' },
			{ ref: 'entity:ent-commande', kind: 'entity', name: 'Commande', href: '/open/entity:ent-commande' }
		]);
	});

	it('searches by name or by the feature that holds an action, within the kind the element takes', () => {
		expect(pickLinks(all, { q: 'commande', kind: 'action' }).map((c) => c.ref)).toEqual(['action:feat-order/a1']);
		expect(pickLinks(all, { q: 'commander', kind: 'action' }).map((c) => c.ref)).toEqual(['action:feat-order/a1']);
		expect(pickLinks(all, { refs: ['feature:feat-order', 'feature:gone'] }).map((c) => c.ref)).toEqual(['feature:feat-order']);
	});
});
