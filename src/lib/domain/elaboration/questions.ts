import type { AddElaborationItem, ElaborationInput } from './report';
import { shortLabel } from './report';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/** How a French sentence names a disposition code (a capability is feminine). */
const FRENCH_DISPOSITIONS: Readonly<Record<string, string>> = { excluded: 'exclue', deferred: 'reportée' };

/** The questions in the spec's language; codes and paths never change, names are quoted as they are. */
const TEXTS = {
	en: {
		briefMissing: ['No project brief is recorded.', 'Who is this product for, what problem should it solve, and what should remain out of scope?'],
		outcomeMissing: ['The expected user or business outcome is not recorded.', 'What observable outcome would make this project worthwhile?'],
		successMissing: ['No success criterion is recorded.', 'What observable result will demonstrate success, and under which conditions?'],
		failureMissing: ['No failure criterion is recorded.', 'Which unacceptable outcome must the product prevent, including interruption or recovery?'],
		audienceMissing: ['No user role is recorded.', 'Who will use the product, and do any users need different permissions or workflows?'],
		scopeMode: ['The authoring scope is unclassified.', 'Should this effort cover the full product, a selected scope, or a prototype? Preserve the requested scope; do not downgrade it to improve a score.'],
		scopeInventory: ['No external capability inventory is recorded.', 'Which capabilities are required by the brief or supplied sources, independently of what has already been modeled?'],
		dispositionObservation: (label: string) => `The disposition of "${label}" is unresolved.`,
		dispositionPrompt: 'Should this capability be included, excluded, or deferred, and why?',
		omissionObservation: (label: string, disposition: string) => `"${label}" is ${disposition} without a compatible, documented scope decision.`,
		omissionPrompt: 'Confirm the intended scope and record why it is left out: the reason a person reads on the Overview. Do not change scope automatically.'
	},
	fr: {
		briefMissing: ["Aucun brief du projet n'est enregistré.", `À qui ce produit s'adresse-t-il, quel problème doit-il résoudre et qu'est-ce qui doit rester hors du périmètre${NBSP}?`],
		outcomeMissing: ["Le résultat attendu pour l'utilisateur ou pour l'entreprise n'est pas enregistré.", `Quel résultat observable rendrait ce projet utile${NBSP}?`],
		successMissing: ["Aucun critère de succès n'est enregistré.", `Quel résultat observable démontrera le succès, et dans quelles conditions${NBSP}?`],
		failureMissing: ["Aucun critère d'échec n'est enregistré.", `Quel résultat inacceptable le produit doit-il empêcher, interruption et reprise comprises${NBSP}?`],
		audienceMissing: ["Aucun rôle d'utilisateur n'est enregistré.", `Qui utilisera le produit, et certains utilisateurs ont-ils besoin de permissions ou de parcours différents${NBSP}?`],
		scopeMode: ["Le périmètre de rédaction n'est pas classé.", `Ce travail doit-il couvrir le produit complet, un périmètre choisi ou un prototype${NBSP}? Gardez le périmètre demandé${NBSP}; ne le réduisez pas pour améliorer un score.`],
		scopeInventory: ["Aucun inventaire des capacités externes n'est enregistré.", `Quelles capacités le brief ou les sources fournies exigent-ils, indépendamment de ce qui est déjà modélisé${NBSP}?`],
		dispositionObservation: (label: string) => `Le sort de la capacité ${quoteName('fr', label)} n'est pas tranché.`,
		dispositionPrompt: `Cette capacité doit-elle être incluse, exclue ou reportée, et pourquoi${NBSP}?`,
		omissionObservation: (label: string, disposition: string) =>
			`La capacité ${quoteName('fr', label)} est ${FRENCH_DISPOSITIONS[disposition] ?? disposition} sans décision de périmètre compatible et documentée.`,
		omissionPrompt: `Confirmez le périmètre voulu et enregistrez pourquoi la capacité est laissée de côté${NBSP}: la raison qu'une personne lit sur l'Overview. Ne changez pas le périmètre automatiquement.`
	}
} as const;

/** Ask only about an observable omission or explicit unresolved disposition. */
export function elaborationQuestions(input: ElaborationInput, add: AddElaborationItem, lang: SpecLanguage = 'en'): void {
	const t = TEXTS[lang];
	const question = (code: string, section: string, path: string, observation: string, prompt: string, subjectId?: string) =>
		add(code, { kind: 'question', priority: 1, section, path, observation, prompt, subjectId, requiresUserDecision: true });
	if (input.foundation) {
		const { identity, definition } = input.foundation;
		if (!identity.brief.trim()) question('brief-missing', 'foundation', 'identity.brief', t.briefMissing[0], t.briefMissing[1]);
		const objective = definition.businessObjective;
		if (!objective.expectedOutcome.trim()) question('outcome-missing', 'foundation', 'definition.businessObjective.expectedOutcome', t.outcomeMissing[0], t.outcomeMissing[1]);
		if (!objective.successCriteria.some(s => s.trim())) question('success-missing', 'foundation', 'definition.businessObjective.successCriteria', t.successMissing[0], t.successMissing[1]);
		if (!objective.failureCriteria.some(s => s.trim())) question('failure-missing', 'foundation', 'definition.businessObjective.failureCriteria', t.failureMissing[0], t.failureMissing[1]);
	}
	if (input.users && input.users.roles.length === 0) question('audience-missing', 'users', 'roles', t.audienceMissing[0], t.audienceMissing[1]);
	if (!input.scope) return;
	const scope = input.scope;
	if (scope.mode === 'unclassified') question('scope-mode', 'scope', 'mode', t.scopeMode[0], t.scopeMode[1]);
	if (scope.capabilities.length === 0) question('scope-inventory', 'scope', 'capabilities', t.scopeInventory[0], t.scopeInventory[1]);
	for (const capability of scope.capabilities) {
		const label = shortLabel(capability.name || capability.id);
		const path = `capabilities.${capability.id}`;
		if (capability.disposition === 'unresolved') question('scope-disposition', 'scope', path, t.dispositionObservation(label), t.dispositionPrompt, capability.id);
		else if (['excluded', 'deferred'].includes(capability.disposition) && (scope.mode === 'full_product' || !capability.rationale.trim())) {
			question('scope-omission', 'scope', path, t.omissionObservation(label, capability.disposition), t.omissionPrompt, capability.id);
		}
	}
}
