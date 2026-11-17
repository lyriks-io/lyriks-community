import type { CandidateIssue } from '$domain/rules';
import type { BehaviorAdvisory } from '../ports';
import type { IssueSeverity } from '$domain/rules';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/** Gap severity → issue severity: engine hard failures block, gaps are major. */
const SEVERITY: Record<string, IssueSeverity> = {
	high: 'critical',
	medium: 'major',
	low: 'minor'
};

/** Don't let one thin feature flood the board — the engine repeats gap kinds. */
const MAX_GAPS_PER_FEATURE = 3;

/**
 * The fixed words of an engine issue, in the spec's language. The engine's
 * own titles, details and gap reasons are passed through as it wrote them;
 * the English texts are the historical ones, byte for byte.
 */
const TEXTS = {
	en: {
		engineTag: 'Flagged by the behavior engine.',
		gapTitle: (name: string, reason: string, entity: string) =>
			`${name}: ${reason}${entity ? ` (${entity})` : ''}`,
		moreTitle: (name: string, count: number) => `${name}: ${count} more critical spec gap(s)`,
		moreDetail: 'Resolve the listed gaps first; the next scan surfaces the rest.'
	},
	fr: {
		engineTag: 'Signalé par le moteur de comportement.',
		gapTitle: (name: string, reason: string, entity: string) =>
			`${quoteName('fr', name)}${NBSP}: ${reason}${entity ? ` (${quoteName('fr', entity)})` : ''}`,
		moreTitle: (name: string, count: number) =>
			`${quoteName('fr', name)}${NBSP}: ${
				count === 1
					? 'encore une lacune critique de la spécification'
					: `encore ${count} lacunes critiques de la spécification`
			}`,
		moreDetail: `Résolvez d'abord les lacunes listées${NBSP}; la prochaine analyse fera apparaître les suivantes.`
	}
} as const;

/**
 * Fold the behavior engine's advisories (unspa verify: invariant violations,
 * failing scenarios, critical spec gaps) into Issues-board candidates, so the
 * automatic scan feeds ONE triage inbox instead of a second, disagreeing conflict
 * surface. A verify failure means the declared behavior contradicts its own
 * invariants/scenarios (→ contradiction). Spec gaps become one issue PER GAP,
 * titled with the engine's actual reason — a card reading "Behavior gaps —
 * <feature>" tells the team nothing to decide, so it never ships. The `capped`
 * coverage notice is advisory noise here.
 *
 * Each candidate's `key` names what it is about (the advisory's code, its
 * feature, the gap's entity), never its wording, so the board recognises the
 * same finding whatever language it is written in.
 */
export function advisoriesToCandidateIssues(
	advisories: BehaviorAdvisory[],
	lang: SpecLanguage = 'en'
): CandidateIssue[] {
	const text = TEXTS[lang];
	const ENGINE_TAG = text.engineTag;
	const out: CandidateIssue[] = [];
	for (const a of advisories) {
		if (a.code === 'verify') {
			out.push({
				key: `engine:verify:${a.featureId ?? a.title}`,
				kind: 'contradiction',
				title: a.title,
				detail: `${a.detail} · ${ENGINE_TAG}`,
				severity: SEVERITY[a.severity] ?? 'minor',
				relatedRuleIds: []
			});
			continue;
		}
		if (a.code !== 'specgap') continue;
		const name = a.featureName ?? a.featureId ?? 'behavior';
		const gaps = (a.gaps ?? []).slice(0, MAX_GAPS_PER_FEATURE);
		// The nth gap about the same entity: an ordinal that does not change with
		// the language the engine writes its reasons in.
		const perEntity = new Map<string, number>();
		for (const g of gaps) {
			const entity = g.entityName ?? '';
			const nth = perEntity.get(entity) ?? 0;
			perEntity.set(entity, nth + 1);
			const where = g.entityName && g.entityName !== name ? g.entityName : '';
			out.push({
				key: `engine:specgap:${a.featureId ?? name}:${entity}:${nth}`,
				kind: 'missing_rule',
				title: text.gapTitle(name, g.reason, where),
				detail: [g.suggestedFix, ENGINE_TAG].filter(Boolean).join(' · '),
				severity: SEVERITY[a.severity] ?? 'minor',
				relatedRuleIds: []
			});
		}
		if ((a.gaps?.length ?? 0) > gaps.length) {
			out.push({
				key: `engine:specgap:${a.featureId ?? name}:more`,
				kind: 'missing_rule',
				title: text.moreTitle(name, a.gaps!.length - gaps.length),
				detail: `${text.moreDetail} · ${ENGINE_TAG}`,
				severity: SEVERITY[a.severity] ?? 'minor',
				relatedRuleIds: []
			});
		}
	}
	return out;
}
