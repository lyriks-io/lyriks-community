import type { AddElaborationItem, ElaborationInput, ElaborationReport, ElaborationItem } from './report';
import { elaborationQuestions } from './questions';
import { elaborationFeatureActions } from './feature-actions';
import { fingerprint } from '../scope';
import { specLanguage, type SpecLanguage } from '$domain/language';

/** The texts of the plan in the spec's language; codes and paths never change. */
const TEXTS = {
	en: {
		unavailable: 'This reading was unavailable; its content is unknown, not empty.',
		unavailablePrompt: 'Retry this reading before concluding that the section is missing or complete.',
		mapping: 'An included capability is not mapped exclusively to existing leaf features.',
		mappingPrompt: 'Author the missing feature or repair the capability mapping; do not remove the requirement to clear the gap.',
		completionPrompt: 'Inspect this completion finding in assess_project_completeness and fix its source. Audit only after the underlying changes are complete.',
		limitations: [
			'Deterministic checks of recorded structure, not semantic understanding of every sentence in the brief.',
			'Authored content is not proof of user confirmation. Recommendations remain proposals; never infer an approval or settle a decision automatically.',
			'An empty question list does not prove completeness. Full verification is optional and runtime acceptance tests are not run here.',
			'Feature dependencies use recorded workflow status, not a proof of implementation or runtime correctness.'
		]
	},
	fr: {
		unavailable: "Cette lecture n'a pas pu être faite\u00a0; son contenu est inconnu, pas vide.",
		unavailablePrompt: 'Refaites cette lecture avant de conclure que la section manque ou est complète.',
		mapping: "Une capacité incluse n'est pas associée uniquement à des fonctionnalités feuilles existantes.",
		mappingPrompt: "Écrivez la fonctionnalité manquante ou réparez l'association de la capacité\u00a0; ne retirez pas l'exigence pour faire disparaître la lacune.",
		completionPrompt: "Examinez ce constat dans assess_project_completeness et corrigez-en la source. Ne lancez l'audit qu'une fois les changements sous-jacents terminés.",
		limitations: [
			'Des vérifications déterministes de la structure enregistrée, pas une compréhension du sens de chaque phrase du brief.',
			"Un contenu écrit ne prouve pas que l'utilisateur l'a confirmé. Les recommandations restent des propositions\u00a0; ne déduisez jamais une approbation et ne tranchez jamais une décision automatiquement.",
			"Une liste de questions vide ne prouve pas que le projet est complet. La vérification complète est facultative et les tests d'acceptation ne sont pas exécutés ici.",
			"Les dépendances entre fonctionnalités reposent sur le statut enregistré, pas sur une preuve d'implémentation ni de bon fonctionnement."
		]
	}
} as const;

/** The language Lyriks writes a project's texts in, read from its Foundation. */
export const elaborationLanguage = (input: ElaborationInput): SpecLanguage =>
	specLanguage(input.foundation?.operations?.i18n?.primaryLocale).generated;

/** A prioritized elaboration aid, never a replacement for the completion gate. */
export function analyzeElaboration(input: ElaborationInput, lang: SpecLanguage = 'en'): ElaborationReport {
	const t = TEXTS[lang];
	const items = new Map<string, ElaborationItem>();
	const add: AddElaborationItem = (code, item) => {
		const id = `${code}:${item.section}:${item.path}`;
		items.set(id, { ...item, id, blockedBy: item.blockedBy ?? [], authority: 'proposal' });
	};
	for (const section of input.unavailable) add('reading-unavailable', {
		kind: 'action', priority: 1, section, path: '', requiresUserDecision: false,
		observation: t.unavailable,
		prompt: t.unavailablePrompt
	});
	elaborationQuestions(input, add, lang);
	elaborationFeatureActions(input, add, lang);
	if (input.scope && input.features) {
		const featureIds = new Set(input.features.features.map(f => f.id));
		for (const capability of input.scope.capabilities.filter(c => c.disposition === 'included')) {
			if (!capability.featureIds.length || capability.featureIds.some(id => !featureIds.has(id))) add('scope-mapping', {
				kind: 'action', priority: 2, section: 'scope', subjectId: capability.id,
				path: `capabilities.${capability.id}.featureIds`, requiresUserDecision: false,
				observation: t.mapping,
				prompt: t.mappingPrompt
			});
		}
	}
	// An item's id comes from what the issue is about, never from its wording,
	// so it is the same whatever language the project is written in.
	const seen = new Map<string, number>();
	for (const issue of input.completion?.issues ?? []) {
		const covered: Record<string, string> = { 'scope-mode-unclassified': 'scope-mode:', 'scope-empty': 'scope-inventory:', 'capability-unresolved': 'scope-disposition:', 'full-product-omission': 'scope-omission:' };
		if (covered[issue.code] && [...items.values()].some(item => item.id.startsWith(covered[issue.code]) && item.path === issue.path)) continue;
		const prefix = issue.path.split('.')[0];
		const section = ['data', 'documents', 'experience', 'coherence'].includes(prefix) ? prefix : 'scope';
		const about = `${issue.code}|${issue.path}`;
		const rank = seen.get(about) ?? 0;
		seen.set(about, rank + 1);
		add(`completion-${issue.code}-${fingerprint(`${issue.path}#${rank}`)}`, {
			kind: 'action', priority: issue.code.startsWith('audit') ? 3 : issue.severity === 'blocking' ? 2 : 3,
			section, path: section === 'scope' ? issue.path : issue.path.slice(prefix.length).replace(/^\./, ''), observation: issue.message,
			prompt: t.completionPrompt,
			requiresUserDecision: issue.code.includes('approv') || issue.code.includes('omission')
		});
	}
	const ordered = [...items.values()].sort((a, b) => a.priority - b.priority || Number(a.blockedBy.length > 0) - Number(b.blockedBy.length > 0) || a.id.localeCompare(b.id));
	return {
		items: ordered,
		counts: { questions: ordered.filter(i => i.kind === 'question').length, actions: ordered.filter(i => i.kind === 'action').length, awaitingDependencies: ordered.filter(i => i.blockedBy.length > 0).length },
		completion: input.completion ? { status: input.completion.status, canFinish: input.completion.canFinish, auditFresh: input.completion.auditFresh } : null,
		limitations: [...t.limitations]
	};
}
