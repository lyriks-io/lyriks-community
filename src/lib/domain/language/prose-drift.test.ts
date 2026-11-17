import { describe, expect, it } from 'vitest';
import {
	behaviorBatchProse,
	behaviorFeatureProse,
	featuresDraftProse,
	proseDrift,
	proseDriftWarning
} from './prose-drift';
import { NBSP } from './spec-language';

const FR = "Le client valide son panier et la commande est créée avec les articles qui sont dans le stock.";
const EN = 'The customer checks out the cart and the order is created with the items that are in stock.';

describe('proseDrift (80ad0a4c)', () => {
	it('flags a piece that reads clearly in another language than the declared one', () => {
		const drifts = proseDrift('en-GB', [
			{ kind: 'feature-description', text: FR, featureId: 'f1', featureName: 'Checkout' },
			{ kind: 'feature-description', text: EN, featureId: 'f2', featureName: 'Cart' }
		]);
		expect(drifts).toEqual([
			{ kind: 'feature-description', text: FR, featureId: 'f1', featureName: 'Checkout', readsIn: 'fr' }
		]);
	});

	it('reads each piece on its own, and leaves a text too short to tell alone', () => {
		const drifts = proseDrift('fr', [
			{ kind: 'scenario-name', text: 'guest pays with a card' },
			{ kind: 'scenario-name', text: 'le client paie par carte' },
			{ kind: 'user-message', text: EN }
		]);
		expect(drifts.map((d) => d.kind)).toEqual(['user-message']);
	});

	it('reads nothing when no language is declared', () => {
		expect(proseDrift('', [{ kind: 'feature-description', text: FR }])).toEqual([]);
		expect(proseDrift(null, [{ kind: 'feature-description', text: FR }])).toEqual([]);
	});
});

describe('where the prose lives', () => {
	it('collects descriptions and acceptance criteria from the features section', () => {
		const pieces = featuresDraftProse({
			features: [{ id: 'f1', name: 'Checkout', description: FR }],
			leafMeta: { f1: { acceptanceCriteria: [{ text: EN }, { text: ' ' }] } }
		});
		expect(pieces.map((p) => [p.kind, p.featureName])).toEqual([
			['feature-description', 'Checkout'],
			['acceptance-criterion', 'Checkout']
		]);
	});

	it('collects action and rule descriptions, scenario names and user messages, never names', () => {
		const pieces = behaviorFeatureProse({
			id: 'f1',
			name: 'Checkout',
			description: FR,
			acceptanceCriteria: [{ title: 'Pay', given: 'a cart', when: 'paying', then: 'an order' }],
			surfaces: [
				{
					name: 'Cart',
					invariants: [{ name: 'stockPositive', message: 'Stock is gone' }],
					actions: [
						{
							name: 'checkout',
							intent: 'Turn the cart into an order',
							rules: [{ description: 'Only a signed-in customer', effect: { type: 'block_action', reason: 'Sign in first' } }],
							effects: [{ type: 'set_state', path: 'cart.items' }],
							scenarios: [{ name: 'guest is refused' }]
						}
					]
				}
			]
		});
		expect(pieces.map((p) => [p.kind, p.text])).toEqual([
			['acceptance-criterion', 'Pay a cart paying an order'],
			['user-message', 'Stock is gone'],
			['action-description', 'Turn the cart into an order'],
			['rule-description', 'Only a signed-in customer'],
			['user-message', 'Sign in first'],
			['scenario-name', 'guest is refused']
		]);
		expect(pieces.some((p) => p.text === 'checkout' || p.text === 'cart.items')).toBe(false);
	});

	it('collects only what a batch writes, op by op', () => {
		const pieces = behaviorBatchProse([
			{ kind: 'add_action', ref: 'a', name: 'checkout', intent: FR },
			{ kind: 'add_action_rule', actionRef: 'a', rule: { description: EN, effect: { type: 'block_action', reason: FR } } },
			{ kind: 'add_scenario', actionRef: 'a', name: FR },
			{ kind: 'add_acceptance_criterion', criterion: { title: FR } },
			{ kind: 'add_state_definition', path: 'cart.items', description: FR }
		]);
		expect(pieces.map((p) => [p.op, p.kind])).toEqual([
			['op[0] (add_action)', 'action-description'],
			['op[1] (add_action_rule)', 'rule-description'],
			['op[1] (add_action_rule)', 'user-message'],
			['op[2] (add_scenario)', 'scenario-name'],
			['op[3] (add_acceptance_criterion)', 'acceptance-criterion']
		]);
	});
});

describe('what is said about it', () => {
	it('names the place and both languages, in the spec language', () => {
		const [drift] = proseDrift('fr', behaviorBatchProse([{ kind: 'add_scenario', actionRef: 'a', name: EN }]));
		expect(proseDriftWarning('fr', 'fr', drift)).toBe(
			`op[0] (add_scenario), nom de scénario${NBSP}: ce texte se lit en anglais alors que la spec est écrite en français${NBSP}: «${NBSP}The customer checks out the cart and the order is created w…${NBSP}». ` +
				`Il est enregistré tel quel${NBSP}; réécrivez-le en français pour que la spec reste dans une seule langue.`
		);
		const [back] = proseDrift('en', behaviorBatchProse([{ kind: 'add_scenario', actionRef: 'a', name: FR }]));
		expect(proseDriftWarning('en', 'en', back)).toContain('reads in French while the spec is written in English');
	});
});
