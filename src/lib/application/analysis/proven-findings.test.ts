import { describe, expect, it } from 'vitest';
import type { SpecGap, SpecProof } from '../ports';
import { proofScope, proofSentence, provenFindings, splitGaps } from './proven-findings';

// Criteria 587d6ef0 and 97f2df12: a proven flaw reads as the requirement it
// breaks, its proof as a scenario, blocking ones first.

const cart = {
	id: 'feat-cart',
	name: 'Cart',
	featureInvariants: [
		{
			id: 'inv-lines',
			name: 'Every line holds an item',
			condition: { left: 'cart.itemCount', operator: 'greater_or_equal', right: 1 }
		}
	],
	reachabilityGoals: [
		{ id: 'goal-bulk', name: 'Bulk order', kind: 'reachable', condition: { left: 'cart.itemCount', operator: 'greater_or_equal', right: 50 } }
	],
	surfaces: [{ id: 's', name: 'Cart', rules: [], invariants: [], actions: [{ id: 'a-wrap', name: 'Gift wrap', rules: [] }] }]
};

const proof = (findings: SpecProof['findings']): SpecProof => ({
	solver: 'ran',
	questions: 10,
	unsettled: 0,
	paths: { maxSteps: 6, results: [] },
	leads: [],
	findings
});

describe('provenFindings', () => {
	const findings = provenFindings(
		cart,
		proof([
			{ kind: 'always-blocked', severity: 'recommended', detail: 'refused', actionId: 'a-wrap', actionName: 'Gift wrap' },
			{ kind: 'redundant-rule', severity: 'recommended', detail: 'repeats' },
			{
				kind: 'reachable-violation',
				severity: 'critical',
				detail: 'breaks',
				invariantId: 'inv-lines',
				invariantName: 'Every line holds an item',
				path: [
					{ actionId: 'a-add', actionName: 'Add item', surfaceId: 's', parameters: { price: 1, qty: 1 } },
					{ actionId: 'a-rm', actionName: 'Remove line', surfaceId: 's', parameters: { $channel: 'ui' } }
				]
			},
			{ kind: 'impossible-goal', severity: 'critical', detail: 'never', goalId: 'goal-bulk', goalName: 'Bulk order' }
		])
	);

	it('puts the blocking flaws first and leaves out what the product does not show', () => {
		expect(findings.map((f) => [f.tone, f.label])).toEqual([
			['blocking', 'Broken'],
			['blocking', 'Impossible'],
			['warning', 'Always refused']
		]);
	});

	it('titles each flaw with the EARS sentence of what it breaks', () => {
		expect(findings[0]!.requirement).toMatch(/^The system shall always ensure that /);
		expect(findings[1]!.requirement).toMatch(/cart item count is at least 50/);
		expect(findings[2]!.requirement).toBe('The system shall allow the user to gift wrap.');
	});

	it('writes the proof as a scenario, each step with its inputs, the channel left out', () => {
		expect(findings[0]).toMatchObject({
			given: 'nothing has happened yet',
			when: ['Add item (price 1, qty 1)', 'Remove line'],
			then: '"Every line holds an item" no longer holds'
		});
		expect(proofSentence(findings[0]!)).toBe(
			'Given nothing has happened yet, when Add item (price 1, qty 1) → Remove line, then "Every line holds an item" no longer holds.'
		);
	});

	it('says nothing when the solver did not run, and falls back on names without a model', () => {
		expect(provenFindings(cart, { ...proof([]), solver: 'unavailable' })).toEqual([]);
		const bare = provenFindings(null, proof([{ kind: 'impossible-invariant', severity: 'critical', detail: 'x', invariantName: 'Total is positive' }]));
		expect(bare[0]!.requirement).toBe('The system shall always ensure that Total is positive.');
	});
});

describe('splitGaps', () => {
	const gap = (reason: string, severity: SpecGap['severity'] = 'recommended'): SpecGap =>
		({ severity, entityType: 'action', entityId: 'a', entityName: 'A', reason, suggestedFix: '' }) as SpecGap;

	it('drops the gaps that repeat a finding, counts code and scenarios, keeps the rest', () => {
		const split = splitGaps(
			[
				gap('Action "A" has no ImplementationStatus entry.'),
				gap('Branch without a scenario: no scenario of "A" runs it successfully.'),
				gap('Invariant "X" breaks in 2 steps. Situation: ...', 'critical'),
				gap('Surface has no transitions.')
			],
			proof([{ kind: 'reachable-violation', severity: 'critical', detail: 'Invariant "X" breaks in 2 steps.' }])
		);
		expect(split.unmapped).toBe(1);
		expect(split.scenariosToWrite).toBe(1);
		expect(split.modeling.map((g) => g.reason)).toEqual(['Surface has no transitions.']);
	});
	it('sorts by the stable code when the engine sends one, whatever the language of the text', () => {
		const coded = (code: string, reason: string, subjectId?: string): SpecGap => ({
			severity: 'recommended',
			entityType: 'action',
			entityId: 'a',
			entityName: 'A',
			reason,
			suggestedFix: '',
			code,
			...(subjectId ? { subjectId } : {})
		});
		const split = splitGaps(
			[
				coded('not-implemented', "L'action « A » n'a pas encore de code."),
				coded('missing-scenario', "Branche sans scénario : aucun scénario de « A » ne la parcourt."),
				coded('proof:reachable-violation', "L'énoncé « X » est enfreint en 2 étapes.", 'inv-x'),
				coded('proof:reachable-violation', "L'énoncé « Y » est enfreint en 3 étapes.", 'inv-y'),
				// A code wins over an English text that would match the old way.
				coded('surface-without-transition', 'Branch without a scenario, as it happens')
			],
			proof([
				{ kind: 'reachable-violation', severity: 'critical', detail: 'Invariant "X" breaks', invariantId: 'inv-x' }
			])
		);
		expect(split.unmapped).toBe(1);
		expect(split.scenariosToWrite).toBe(1);
		expect(split.modeling.map((g) => g.code)).toEqual([
			'proof:reachable-violation',
			'surface-without-transition'
		]);
		expect(split.modeling[0]!.subjectId).toBe('inv-y');
	});
});

describe('proofScope', () => {
	it('says how far the proof went, and what it left open, never a silent pass', () => {
		expect(proofScope(proof([]))).toEqual({
			text: 'Proven for every input, on every path of up to 6 steps from the start.',
			open: false
		});
		expect(proofScope({ ...proof([]), unsettled: 2 })?.open).toBe(true);
		expect(proofScope({ ...proof([]), unsettled: 2 })?.text).toContain('Not proven: 2 questions left unsettled');
		expect(proofScope({ ...proof([]), solver: 'unavailable', reason: 'z3 missing' })).toEqual({
			text: 'The solver did not start (z3 missing): nothing here is proven.',
			open: true
		});
		// The engine's own reason opens with the same words: they are said once.
		const native = { ...proof([]), solver: 'unavailable' as const, reason: 'The solver did not start: no native solver is installed' };
		expect(proofScope(native)?.text).toBe('The solver did not start (no native solver is installed): nothing here is proven.');
		expect(proofScope(native, 'fr')?.text).toContain("aucun solveur natif n'est installé");
	});
});

// Criterion a92ffe7e: the finding cards read in the language the project
// declares; the names the model carries are quoted verbatim, never translated.
/** A French expectation with the spaces French typography keeps unbreakable: inside « » and before : ; ! ? */
const nb = (text: string): string =>
	text.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ ([:;!?])/g, '\u00a0$1');

describe('in French', () => {
	const findings = provenFindings(
		null,
		proof([
			{ kind: 'always-blocked', severity: 'recommended', detail: 'refused', actionId: 'a-wrap', actionName: 'Gift wrap' },
			{
				kind: 'reachable-violation',
				severity: 'critical',
				detail: 'breaks',
				invariantId: 'inv-lines',
				invariantName: 'Every line holds an item',
				path: [
					{ actionId: 'a-add', actionName: 'Add item', surfaceId: 's', parameters: { price: 1, size: 'XL' } },
					{ actionId: 'a-rm', actionName: 'Remove line', featureName: 'Cart', surfaceId: 's', parameters: { $channel: 'ui' } }
				]
			},
			{ kind: 'unmet-goal', severity: 'recommended', detail: 'never', goalId: 'goal-bulk', goalName: 'Bulk order' },
			{ kind: 'shadowed-rule', severity: 'recommended', detail: 'hidden by "Stock"', ruleId: 'r-1', actionName: 'Gift wrap' }
		]),
		'fr'
	);

	it('labels, requirements and fixes read in French', () => {
		expect(findings.map((f) => f.label)).toEqual(['Enfreint', 'Toujours refusée', 'Non atteint', 'Règle masquée']);
		expect(findings[0]!.requirement).toBe(nb("Le système doit toujours garantir l'énoncé « Every line holds an item »."));
		expect(findings[1]!.requirement).toBe(nb("Le système doit permettre à l'utilisateur d'exécuter « Gift wrap »."));
		expect(findings[2]!.requirement).toBe(nb("Le système doit permettre d'atteindre « Bulk order »."));
		expect(findings[3]!.requirement).toBe(nb('Une règle de « Gift wrap ».'));
		expect(findings[3]!.requirement).not.toContain('hidden');
		expect(findings[1]!.fix).toBe(nb('Assouplissez ses gardes : elles refusent tous les cas.'));
	});

	it('writes the proof as Étant donné / Quand / Alors, names quoted with guillemets', () => {
		expect(findings[0]).toMatchObject({
			given: "l'état de départ, avant toute action",
			when: [nb('« Add item » (« price » à 1, « size » à « XL »)'), nb('« Cart » › « Remove line »')],
			then: nb("l'énoncé « Every line holds an item » n'est plus respecté")
		});
		expect(proofSentence(findings[0]!, 'fr')).toBe(
			nb("Étant donné l'état de départ, avant toute action, quand « Add item » (« price » à 1, « size » à « XL ») → « Cart » › « Remove line », alors l'énoncé « Every line holds an item » n'est plus respecté.")
		);
		expect(findings[2]!.when).toEqual(["n'importe quelle suite de 6 actions au plus, quelles que soient leurs entrées"]);
		expect(findings[3]).toMatchObject({
			when: [nb("« Gift wrap » avec n'importe quelle entrée")],
			then: 'une règle antérieure refuse toujours en premier, donc celle-ci ne décide jamais'
		});
	});

	it('writes the dead end and the impossible statement in French', () => {
		const [impossible, dead] = provenFindings(
			null,
			proof([
				{
					kind: 'reachable-deadlock',
					severity: 'recommended',
					detail: 'stuck',
					path: [{ actionId: 'a-pay', actionName: 'Pay', surfaceId: 's', parameters: {} }]
				},
				{ kind: 'impossible-invariant', severity: 'critical', detail: 'x', invariantName: 'Total is positive' }
			]),
			'fr'
		).sort((a, b) => a.kind.localeCompare(b.kind));
		expect(impossible!.requirement).toBe(nb("Le système doit toujours garantir l'énoncé « Total is positive »."));
		expect(impossible!.then).toBe(nb("l'énoncé « Total is positive » ne peut pas être respecté : chaque exécution l'enfreint"));
		expect(dead!.requirement).toBe(nb('Après « Pay », le système doit encore permettre au moins une action.'));
		expect(dead!.then).toBe("plus aucune action ne peut s'exécuter, quelles que soient ses entrées");
	});

	it('writes the requirements from the model in French when the feature is there', () => {
		const [broken] = provenFindings(
			cart,
			proof([{ kind: 'reachable-violation', severity: 'critical', detail: 'b', invariantId: 'inv-lines', invariantName: 'Every line holds an item', path: [] }]),
			'fr'
		);
		expect(broken!.requirement).toMatch(/^Le système doit/);
	});

	it('says how far the proof went in French', () => {
		expect(proofScope(proof([]), 'fr')).toEqual({
			text: 'Prouvé pour toute entrée, sur tout chemin de 6 étapes au plus depuis le départ.',
			open: false
		});
		expect(
			proofScope(
				{
					...proof([]),
					unsettled: 2,
					paths: { maxSteps: 6, results: [{ invariantName: 'Stock', outcome: 'unsupported' }] },
					interrupted: 'timeout'
				} as unknown as SpecProof,
				'fr'
			)?.text
		).toBe(
			nb("Prouvé pour toute entrée, sur tout chemin de 6 étapes au plus depuis le départ. Non prouvé : 2 questions laissées en suspens ; « Stock » non lu par le solveur ; interrompu (le moteur n'en donne la raison qu'en anglais).")
		);
		expect(proofScope({ ...proof([]), solver: 'unavailable', reason: 'z3 missing' }, 'fr')).toEqual({
			text: nb("Le solveur n'a pas démarré (le moteur n'en donne la raison qu'en anglais) : rien ici n'est prouvé."),
			open: true
		});
	});

	it('never prints a raw truth value, nor the engine\'s English detail', () => {
		const [wrapped] = provenFindings(
			null,
			proof([
				{
					kind: 'reachable-violation',
					severity: 'critical',
					detail: 'breaks',
					invariantName: 'Paid',
					path: [{ actionId: 'a', actionName: 'Pay', surfaceId: 's', parameters: { ok: true, total: 2.5 } }]
				}
			]),
			'fr'
		);
		expect(wrapped!.when).toEqual([nb('« Pay » (« ok » à vrai, « total » à 2,5)')]);
		const [rule] = provenFindings(
			null,
			proof([{ kind: 'dead-rule', severity: 'recommended', detail: 'never fires', ruleId: 'r' }]),
			'fr'
		);
		expect(rule!.requirement).toBe('Une règle de la fonctionnalité.');
	});

	it('names a known engine reason in French', () => {
		expect(proofScope({ ...proof([]), solver: 'unavailable', reason: 'z3-solver is missing' }, 'fr')?.text).toBe(
			nb("Le solveur n'a pas démarré (le solveur Z3 n'est pas installé) : rien ici n'est prouvé.")
		);
	});
});

describe('a target not reached says what holds it back [criterion:39ea86c2]', () => {
	const proof = (stuck: unknown) =>
		({
			solver: 'ran',
			findings: [{ kind: 'unreachable-action', severity: 'recommended', detail: '', actionId: 'a-1', actionName: 'Auto-stop timer', stuck }]
		}) as never;

	it('names the state nothing changes and what to add, as the fix of its card', () => {
		const [finding] = provenFindings(null, proof([{ path: 'timer.elapsedMinutes', startsAt: 0, changedBy: [] }]));
		expect(finding!.label).toBe('Not reached');
		expect(finding!.fix).toBe(
			'Nothing changes "timer.elapsedMinutes" (starts at 0): add what changes it (an action of a person, of the system or of a schedule, one that makes time pass when time is what changes it) or a persona that starts with another value.'
		);
	});

	it('names the actions that alone change a state, themselves not reached, in French too', () => {
		const [finding] = provenFindings(
			null,
			proof([{ path: 'workspace.lifecycle', startsAt: 'active', changedBy: ['Delete workspace'] }]),
			'fr'
		);
		expect(finding!.fix).toBe(
			nb("« workspace.lifecycle » (part de « active ») ne change que par « Delete workspace », elle-même non atteinte : ouvrez d'abord sa voie.")
		);
	});

	it('keeps the general advice when the engine names no state', () => {
		const [finding] = provenFindings(null, proof(undefined));
		expect(finding!.fix).toBe('Let an earlier action open its way, loosen its guard, or remove it.');
	});
});
