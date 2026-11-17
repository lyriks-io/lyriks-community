import type { AddElaborationItem, ElaborationInput } from './report';
import { shortLabel } from './report';
import { dependencyCycleMembers } from './dependency-cycles';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/** How a French sentence names a workflow status code. */
const FRENCH_STATUSES: Readonly<Record<string, string>> = {
	backlog: 'en attente (backlog)',
	'in-progress': 'en cours',
	done: 'terminée'
};

/** The feature actions in the spec's language; codes and paths never change, names are quoted as they are. */
const TEXTS = {
	en: {
		cycle: (label: string) => `"${label}" belongs to a dependency cycle.`,
		cyclePrompt: 'Review the dependency cycle and clarify the intended order or split of responsibilities before scheduling the affected work.',
		noCriterion: (label: string) => `"${label}" has no recorded acceptance criterion.`,
		noCriterionPrompt: 'Which input, observable result, failure case and tolerance should a real implementation test check?',
		badDependency: (label: string, self: boolean) => `"${label}" has a ${self ? 'self' : 'missing'} dependency.`,
		badDependencyPrompt: 'Inspect the intended dependency and repair its reference before planning implementation.',
		status: (label: string, status: string) => `"${label}" is ${status}.`,
		blockedPrompt: 'Resolve the listed feature dependencies before implementing this feature; authoring its requirements can continue.',
		workPrompt: 'Inspect the feature behavior, acceptance criteria and current implementation evidence before starting or continuing implementation.'
	},
	fr: {
		cycle: (label: string) => `La fonctionnalité ${quoteName('fr', label)} fait partie d'un cycle de dépendances.`,
		cyclePrompt: "Examinez le cycle de dépendances et précisez l'ordre voulu ou le partage des responsabilités avant de planifier le travail concerné.",
		noCriterion: (label: string) => `La fonctionnalité ${quoteName('fr', label)} n'a aucun critère d'acceptation enregistré.`,
		noCriterionPrompt: `Quelle entrée, quel résultat observable, quel cas d'échec et quelle tolérance un test de la vraie implémentation doit-il vérifier${NBSP}?`,
		badDependency: (label: string, self: boolean) =>
			self
				? `La fonctionnalité ${quoteName('fr', label)} dépend d'elle-même.`
				: `La fonctionnalité ${quoteName('fr', label)} dépend d'une fonctionnalité qui n'existe pas.`,
		badDependencyPrompt: "Examinez la dépendance voulue et réparez sa référence avant de planifier l'implémentation.",
		status: (label: string, status: string) => `La fonctionnalité ${quoteName('fr', label)} est ${FRENCH_STATUSES[status] ?? quoteName('fr', status)}.`,
		blockedPrompt: `Résolvez les dépendances listées avant d'implémenter cette fonctionnalité${NBSP}; la rédaction de ses exigences peut continuer.`,
		workPrompt: "Examinez le comportement de la fonctionnalité, ses critères d'acceptation et les preuves d'implémentation actuelles avant de commencer ou de poursuivre l'implémentation."
	}
} as const;

export function elaborationFeatureActions(input: ElaborationInput, add: AddElaborationItem, lang: SpecLanguage = 'en'): void {
	if (!input.features) return;
	const t = TEXTS[lang];
	const draft = input.features;
	const ids = new Set(draft.features.map(f => f.id));
	const cycles = dependencyCycleMembers(new Map(draft.features.map(f => [f.id, draft.leafMeta?.[f.id]?.dependsOn ?? []])));
	for (const feature of draft.features) {
		const meta = draft.leafMeta?.[feature.id];
		const dependencies = [...new Set(meta?.dependsOn ?? [])];
		const blockedBy = dependencies.filter(id => !ids.has(id) || draft.leafMeta?.[id]?.status !== 'done');
		const base = { section: 'features', subjectId: feature.id, requiresUserDecision: false };
		const label = shortLabel(feature.name || feature.id);
		if (cycles.has(feature.id)) add('feature-cycle', {
			...base, kind: 'action', priority: 1, path: `leafMeta.${feature.id}.dependsOn`,
			observation: t.cycle(label),
			prompt: t.cyclePrompt
		});
		// One list: the model's, which holds the criteria projected from this panel AND
		// the ones an AI client wrote. A feature the model does not know yet is answered
		// by the draft, so the question still works before the first save.
		const modelCriteria = input.acceptanceCriteriaByFeature?.[feature.id];
		const criterionCount = modelCriteria ?? (meta?.acceptanceCriteria ?? []).filter(c => c.text.trim()).length;
		if (criterionCount === 0) add('feature-acceptance', {
			...base, kind: 'question', priority: 2, path: `leafMeta.${feature.id}.acceptanceCriteria`,
			observation: t.noCriterion(label),
			prompt: t.noCriterionPrompt, requiresUserDecision: true
		});
		for (const dependency of dependencies) {
			if (dependency === feature.id || !ids.has(dependency)) add('feature-dependency', {
				...base, kind: 'action', priority: 1, path: `leafMeta.${feature.id}.dependsOn.${dependency}`,
				observation: t.badDependency(label, dependency === feature.id),
				prompt: t.badDependencyPrompt
			});
		}
		if (meta?.status !== 'done') add('feature-work', {
			...base, kind: 'action', priority: meta?.status === 'in-progress' ? 2 : 3,
			path: `leafMeta.${feature.id}.status`, blockedBy,
			observation: t.status(label, meta?.status ?? 'backlog'),
			prompt: blockedBy.length ? t.blockedPrompt : t.workPrompt
		});
	}
}
