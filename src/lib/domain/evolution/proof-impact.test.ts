import { describe, expect, it } from 'vitest';
import { exampleSteps, proofImpactHeadline, proofImpactLines, proofImpactScope, type DraftProofImpact } from './proof-impact';

// Criterion be1e5ccd: what a change does to the proofs reads in the language
// the project declares; the names the model carries are quoted verbatim.

const base: DraftProofImpact = {
	draftId: 'd',
	draftName: 'Cart',
	ranAt: 'at',
	proven: { before: true, after: true },
	statements: [],
	actions: [],
	goals: [],
	findingsAppeared: [],
	findingsResolved: [],
	scenarios: [],
	unchanged: false
};

/** A French expectation with the spaces French typography keeps unbreakable: inside « » and before : ; ! ? */
const nb = (text: string): string =>
	text.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ ([:;!?])/g, '\u00a0$1');

describe('exampleSteps in French', () => {
	it('writes each action with its values, names in guillemets, the channel left out', () => {
		expect(
			exampleSteps(
				[
					{ actionName: 'Refund', parameters: { amount: 0.5, reason: 'goodwill', urgent: true, late: false, $channel: 'ui' } },
					{ actionName: 'Sign in', featureName: 'Accounts', parameters: {} }
				],
				'fr'
			)
		).toEqual([
			nb("Quelqu'un exécute « Refund », avec « amount » à 0,5, « reason » à « goodwill », « urgent » à vrai et « late » à faux"),
			nb("Quelqu'un exécute « Sign in » (dans « Accounts »)")
		]);
	});
});

describe('proofImpactHeadline in French', () => {
	it('says what the change breaks, stops and repairs', () => {
		expect(
			proofImpactHeadline(
				{
					...base,
					statements: [
						{ id: 'a', name: 'Never refund more than paid', before: 'none-within-bound', after: 'violated' },
						{ id: 'b', name: 'Every line holds an item', before: 'violated', after: 'none-within-bound' }
					],
					scenarios: [{ actionName: 'Refund', scenarioName: 'A viewer cannot refund', before: 'pass', after: 'fail' }],
					deadlocks: { before: 'none-within-bound', after: 'found' }
				},
				'fr'
			)
		).toBe(
			nb('Le changement enfreint « Never refund more than paid », fait échouer le scénario « A viewer cannot refund », crée une impasse, répare « Every line holds an item ».')
		);
	});

	it('counts flaws, and names the rest past two', () => {
		expect(
			proofImpactHeadline(
				{
					...base,
					statements: ['A', 'B', 'C'].map((name) => ({ id: name, name, before: 'none-within-bound', after: 'violated' })),
					findingsResolved: [
						{ kind: 'dead-rule', severity: 'recommended', on: 'x', detail: '' },
						{ kind: 'dead-rule', severity: 'recommended', on: 'y', detail: '' }
					]
				},
				'fr'
			)
		).toBe(nb('Le changement enfreint « A » et 2 autres, supprime 2 défauts.'));
		expect(
			proofImpactHeadline({ ...base, findingsAppeared: [{ kind: 'dead-rule', severity: 'recommended', on: 'x', detail: '' }] }, 'fr')
		).toBe('Le changement ajoute 1 défaut.');
	});

	it('never reads a side left unproven as nothing changing', () => {
		expect(proofImpactHeadline({ ...base, unavailable: 'the behavior engine is unreachable' }, 'fr')).toBe(nb('Non comparé : le moteur de comportement est injoignable.'));
		expect(proofImpactHeadline({ ...base, proven: { before: true, after: false } }, 'fr')).toBe(
			nb("Non prouvé : le solveur n'a pas pu prouver l'un des deux côtés.")
		);
		expect(proofImpactHeadline({ ...base, unchanged: true }, 'fr')).toBe('Rien de ce que prouve le solveur ne change.');
		expect(
			proofImpactHeadline({ ...base, actions: [{ id: 'a', name: 'Pay', before: 'reached', after: 'none-within-bound' }] }, 'fr')
		).toBe('Ce que prouve le solveur bouge, sans rien enfreindre ni rien réparer.');
	});

	it('stays in English when no language is given', () => {
		expect(proofImpactHeadline({ ...base, unchanged: true })).toBe('Nothing the solver proves changes.');
	});
});

describe('proofImpactLines in French', () => {
	it('says what breaks with its example, and why a scenario moved', () => {
		expect(
			proofImpactLines(
				{
					...base,
					statements: [{ id: 'i', name: 'Never refund more than paid', before: 'none-within-bound', after: 'violated' }],
					findingsAppeared: [
						{
							kind: 'reachable-violation',
							severity: 'critical',
							on: 'Never refund more than paid',
							detail: 'x',
							path: [{ actionName: 'Refund', parameters: { amount: 0.5 } }]
						}
					],
					scenarios: [
						{
							actionName: 'Refund',
							scenarioName: 'A viewer cannot refund',
							before: 'pass',
							after: 'fail',
							reason: 'fail. status was success but expected blocked'
						},
						{ actionName: 'Pay', scenarioName: 'Paying twice', before: 'fail', after: 'pass' }
					]
				},
				'fr'
			)
		).toEqual([
			{
				tone: 'worse',
				text: nb("L'énoncé « Never refund more than paid » peut désormais être enfreint."),
				example: [nb("Quelqu'un exécute « Refund », avec « amount » à 0,5")]
			},
			{
				tone: 'worse',
				text: nb("L'exemple « A viewer cannot refund » (« Refund ») ne tient plus : il passe désormais là où il devrait être refusé.")
			},
			{ tone: 'better', text: nb("L'exemple « Paying twice » (« Pay ») tient de nouveau.") }
		]);
	});

	it('writes repairs, actions, goals, dead ends and other flaws in French', () => {
		const lines = proofImpactLines(
			{
				...base,
				statements: [{ id: 'i', name: 'Every line holds an item', before: 'violated', after: 'none-within-bound' }],
				findingsResolved: [
					{
						kind: 'reachable-violation',
						severity: 'critical',
						on: 'Every line holds an item',
						detail: 'x',
						path: [{ actionName: 'Remove line', parameters: { qty: 1 } }]
					},
					{ kind: 'shadowed-rule', severity: 'recommended', on: 'Stock check', detail: '' }
				],
				findingsAppeared: [{ kind: 'always-blocked', severity: 'recommended', on: 'Gift wrap', detail: '' }],
				actions: [
					{ id: 'a', name: 'Pay', before: 'reached', after: 'none-within-bound' },
					{ id: 'b', name: 'Ship', before: 'none-within-bound', after: 'reached' }
				],
				goals: [
					{ id: 'g', name: 'Bulk order', before: 'reached', after: 'none-within-bound' },
					{ id: 'h', name: 'Paid order', before: 'none-within-bound', after: 'reached' }
				],
				deadlocks: { before: 'none-within-bound', after: 'found', path: ['Pay'] }
			},
			'fr'
		);
		expect(lines).toEqual([
			{ tone: 'worse', text: nb("L'action « Pay » ne peut plus avoir lieu.") },
			{ tone: 'worse', text: nb("L'objectif « Bulk order » ne peut plus être atteint.") },
			{
				tone: 'worse',
				text: nb('Une impasse apparaît : après cela, plus rien ne peut être fait.'),
				example: [nb("Quelqu'un exécute « Pay »")]
			},
			{ tone: 'worse', text: nb('Nouvelle action refusée à chaque fois (« Gift wrap »).') },
			{
				tone: 'better',
				text: nb("L'énoncé « Every line holds an item » ne peut plus être enfreint. Avant le changement, il était enfreint ainsi :"),
				example: [nb("Quelqu'un exécute « Remove line », avec « qty » à 1")]
			},
			{ tone: 'better', text: nb("L'action « Ship » peut désormais avoir lieu.") },
			{ tone: 'better', text: nb("L'objectif « Paid order » peut désormais être atteint.") },
			{ tone: 'better', text: nb('Une règle masquée par une règle antérieure a disparu (« Stock check »).') }
		]);
	});

	it('claims nothing about a check left unsettled on one side', () => {
		expect(
			proofImpactLines(
				{
					...base,
					statements: [
						{ id: 'i', name: 'Stock never negative', before: 'violated', after: 'unsettled' },
						{ id: 'j', name: 'Totals add up', before: 'unsettled', after: 'violated' }
					],
					deadlocks: { before: 'unsettled', after: 'found' }
				},
				'fr'
			)
		).toEqual([
			{ tone: 'worse', text: nb("L'énoncé « Totals add up » peut être enfreint (on n'a pas pu établir s'il pouvait l'être avant le changement).") },
			{ tone: 'open', text: nb("L'énoncé « Stock never negative » : on n'a pas pu établir, après le changement, s'il peut encore être enfreint.") },
			{ tone: 'open', text: nb("Les impasses n'ont pas pu être vérifiées avant le changement : rien n'est donc affirmé à leur sujet.") }
		]);
	});

	it('writes the dead end gone in French', () => {
		expect(proofImpactLines({ ...base, deadlocks: { before: 'found', after: 'none-within-bound' } }, 'fr')).toEqual([
			{ tone: 'better', text: nb("L'impasse a disparu : il reste toujours quelque chose à faire ensuite.") }
		]);
	});
});

describe('French reasons and agreement', () => {
	it('never shows an English reason in French: a known one is translated, another is said to exist only in English', () => {
		expect(proofImpactHeadline({ ...base, unavailable: 'Feature not found: x' }, 'fr')).toBe(
			nb("Non comparé : le moteur n'a pas pu comparer le brouillon (sa raison n'existe qu'en anglais).")
		);
		expect(
			proofImpactHeadline(
				{ ...base, proven: { before: true, after: false, reason: 'after the change: z3-solver is missing, so nothing was proven' } },
				'fr'
			)
		).toBe(nb("Non prouvé : après le changement, le solveur Z3 n'est pas installé, donc rien n'a été prouvé."));
		expect(
			proofImpactHeadline(
				{ ...base, proven: { before: false, after: true, reason: 'before the change: Z3 stopped answering, so nothing was proven' } },
				'fr'
			)
		).toBe(nb("Non prouvé : avant le changement, le solveur n'a rien prouvé (sa raison n'existe qu'en anglais)."));
		// English is left as the engine wrote it.
		expect(proofImpactHeadline({ ...base, unavailable: 'Feature not found: x' })).toBe('Not compared: Feature not found: x.');
	});

	it('agrees the adjective of a new flaw with its noun', () => {
		const lines = proofImpactLines(
			{
				...base,
				findingsAppeared: [
					{ kind: 'dead-rule', severity: 'recommended', on: 'R', detail: '' },
					{ kind: 'impossible-goal', severity: 'critical', on: 'G', detail: '' }
				]
			},
			'fr'
		).map((l) => l.text);
		expect(lines).toEqual([
			nb("Nouvelle règle qui ne peut plus jamais s'appliquer (« R »)."),
			nb('Nouvel objectif que rien ne peut atteindre (« G »).')
		]);
	});
});

describe('a change that reaches other features', () => {
	const stockBroken = {
		featureId: 'stock',
		featureName: 'Stock',
		proven: { before: true, after: true },
		statements: [{ id: 'i', name: 'Stock never negative', before: 'none-within-bound', after: 'violated' }],
		actions: [],
		goals: [],
		findingsAppeared: [],
		findingsResolved: [],
		scenarios: [],
		unchanged: false
	};
	const impact: DraftProofImpact = {
		...base,
		draftName: 'Sales',
		scope: [
			{ featureId: 'sales', featureName: 'Sales', reason: 'changed' },
			{ featureId: 'stock', featureName: 'Stock', reason: 'declares-a-written-state', states: ['stock.left'] }
		],
		dependents: [stockBroken]
	};

	it('says what breaks in the feature the change reaches, never that nothing changes', () => {
		expect(proofImpactHeadline(impact)).toBe('The change breaks "Stock never negative" in "Stock".');
		expect(proofImpactLines(impact)).toEqual([
			{ tone: 'worse', text: 'In "Stock": "Stock never negative" can now be broken.' }
		]);
		expect(proofImpactHeadline(impact, 'fr')).toBe(nb('Le changement enfreint « Stock never negative » dans « Stock ».'));
	});

	it('names the other features it proved and why', () => {
		expect(proofImpactScope(impact)).toBe('Also proved, since the change writes what it declares: "Stock" (stock.left).');
		expect(proofImpactScope(impact, 'fr')).toBe(
			nb("Également prouvée, car le changement écrit ce qu'elle déclare : « Stock » (stock.left).")
		);
		expect(proofImpactScope(base)).toBeNull();
	});

	it('says a reached feature it could not prove, rather than nothing', () => {
		const unproven = { ...impact, dependents: [{ ...stockBroken, proven: { before: true, after: false } }] };
		expect(proofImpactLines(unproven)).toEqual([
			{ tone: 'open', text: '"Stock" could not be proven on both sides, so nothing is said about it.' }
		]);
	});
});

// Criterion d1b64667: how a change breaks a statement reads as an example anyone can follow.
describe('exampleSteps', () => {
	it('writes each action a person takes with the values used, in plain words, the channel left out', () => {
		expect(
			exampleSteps([
				{ actionName: 'Record payment', parameters: { amount: 100 } },
				{ actionName: 'Refund', parameters: { amount: 0.5, reason: 'goodwill', urgent: true, $channel: 'ui' } },
				{ actionName: 'Sign in', featureName: 'Accounts', parameters: {} }
			])
		).toEqual([
			'Someone does "Record payment", with amount 100',
			'Someone does "Refund", with amount 0.5, reason "goodwill", urgent yes',
			'Someone does "Sign in" (in Accounts)'
		]);
	});
});

// Criterion 0fb8f527: every line of what a change does to the proofs reads in plain words.
describe('proofImpactLines', () => {
	it('says what breaks with its example, and a scenario that moves without the engine status words', () => {
		const lines = proofImpactLines({
			...base,
			statements: [{ id: 'i', name: 'Never refund more than paid', before: 'none-within-bound', after: 'violated' }],
			findingsAppeared: [{ kind: 'reachable-violation', severity: 'critical', on: 'Never refund more than paid', detail: 'x', path: [{ actionName: 'Refund', parameters: { amount: 0.5 } }] }],
			scenarios: [{ actionName: 'Refund', scenarioName: 'A viewer cannot refund', before: 'pass', after: 'fail', reason: 'fail. status was success but expected blocked' }]
		});
		expect(lines).toEqual([
			{ tone: 'worse', text: '"Never refund more than paid" can now be broken.', example: ['Someone does "Refund", with amount 0.5'] },
			{ tone: 'worse', text: 'The example "A viewer cannot refund" (Refund) no longer holds: it now goes through where it should be refused.' }
		]);
	});

	it('shows how a repaired statement used to break', () => {
		const [line] = proofImpactLines({
			...base,
			statements: [{ id: 'i', name: 'Every line holds an item', before: 'violated', after: 'none-within-bound' }],
			findingsResolved: [{ kind: 'reachable-violation', severity: 'critical', on: 'Every line holds an item', detail: 'x', path: [{ actionName: 'Remove line', parameters: { qty: 1 } }] }]
		});
		expect(line).toEqual({
			tone: 'better',
			text: '"Every line holds an item" can no longer be broken. Before the change, it broke like this:',
			example: ['Someone does "Remove line", with qty 1']
		});
	});

	it('claims nothing about a check left unsettled on one side', () => {
		const lines = proofImpactLines({
			...base,
			statements: [{ id: 'i', name: 'Stock never negative', before: 'violated', after: 'unsettled' }],
			deadlocks: { before: 'found', after: 'unsettled' }
		});
		expect(lines.map((l) => l.tone)).toEqual(['open', 'open']);
		expect(lines[1]?.text).toBe('Dead ends could not be checked after the change, so nothing is said about them.');
		expect(proofImpactHeadline({ ...base, statements: [{ id: 'i', name: 'X', before: 'violated', after: 'unsettled' }] })).not.toContain('repairs');
	});
});
