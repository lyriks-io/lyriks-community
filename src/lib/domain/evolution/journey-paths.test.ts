import { describe, expect, it } from 'vitest';
import { JOURNEY_PATH_PREFIX, journeyPaths, pathFingerprint } from './journey-paths';
import type { DiagramFlow } from './functional-diagram';

const flow = (useCase: string, text = 'Le client marque sa commande retirée'): DiagramFlow => ({
	useCase,
	steps: [
		{ lane: 'Client', text: 'Le client ouvre sa commande', branches: [] },
		{ lane: 'Produit', text, branches: [{ kind: 'refused', when: 'la commande n’est pas prête', then: 'le bouton reste grisé' }] }
	]
});

describe('each path of the journey is validated on its own [criterion:ac-leaf-ac-evo-spec-journey-paths]', () => {
	it('gives one path per flow, named after its use case, on a stable synthetic field', () => {
		const paths = journeyPaths({ flows: [flow('Retirer sa commande'), flow('Prévenir le client que sa commande est prête')] });
		expect(paths.map((p) => p.key)).toEqual([`${JOURNEY_PATH_PREFIX}retirer-sa-commande`, `${JOURNEY_PATH_PREFIX}prevenir-le-client-que-sa-commande-est-prete`]);
		expect(paths[0].useCase).toBe('Retirer sa commande');
	});

	it('keeps two flows of one use case apart', () => {
		const paths = journeyPaths({ flows: [flow('Retirer sa commande'), flow('Retirer sa commande')] });
		expect(new Set(paths.map((p) => p.key)).size).toBe(2);
	});

	it('changes its fingerprint when a step, a refusal or a failure changes, so its validation goes stale', () => {
		const before = pathFingerprint(flow('Retirer sa commande'));
		expect(pathFingerprint(flow('Retirer sa commande'))).toBe(before);
		expect(pathFingerprint(flow('Retirer sa commande', 'Le client confirme le retrait'))).not.toBe(before);
		const refusal = flow('Retirer sa commande');
		const changed = { ...refusal, steps: [refusal.steps[0], { ...refusal.steps[1], branches: [{ kind: 'refused' as const, when: 'déjà retirée', then: 'rien ne change' }] }] };
		expect(pathFingerprint(changed)).not.toBe(before);
	});
});
