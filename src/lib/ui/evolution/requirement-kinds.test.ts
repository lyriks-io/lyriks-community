import { describe, expect, it } from 'vitest';
import { requirementKindOf, requirementOrder } from './requirement-kinds';

describe('the kinds of 2.1, in the order the owner chose [criterion:ac-leaf-ac-evo-sol-diagram-alone]', () => {
	it('reads the change, how it goes and holds, then how it is checked and where it stops', () => {
		const places = [
			['solution', 'out_of_scope'],
			['functional_spec', 'failures'],
			['solution', 'examples'],
			['functional_spec', 'experience'],
			['functional_spec', 'screens'],
			['functional_spec', 'interactions'],
			['functional_spec', 'refusals'],
			['functional_spec', 'description'],
			['solution', 'description']
		] as const;
		const sorted = [...places].sort((a, b) => requirementOrder(a[0], a[1]) - requirementOrder(b[0], b[1]));
		expect(sorted.map(([step, key]) => requirementKindOf('fr', step, key))).toEqual([
			'Changement',
			'Parcours',
			'Règle',
			'Interaction',
			'Écran',
			'Expérience',
			'Exemple',
			'Échec',
			'Hors périmètre'
		]);
	});
});
