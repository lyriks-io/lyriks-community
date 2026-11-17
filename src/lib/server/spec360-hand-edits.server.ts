import type { AppServices } from '$composition/container.server';
import { editedFields, type ElementEdit } from '$application/spec360/edits';
import { indexFeatureActions } from '$application/specification/index-feature-actions';
import type { ActionImplementationCoverage, FeatureImplementationCoverage } from '$application/use-cases';
import type { ElementText, SpecEditChange } from '$domain/retrospec';

/**
 * What a hand edit of a validated Specification 360° is followed with
 * (criteria 68b978c4, 956cb2ac of feat-fb747-traceability): what the element
 * read before the save, and whether the code implements it. Only a feature
 * whose actions the implementation index locates, or one of those actions, is
 * implemented: its edit gets a line on Code drift, read against the code by
 * the next retrospecification. Anything else is prose the code cannot confirm,
 * so it is marked instead.
 */

export interface HandEditBefore {
	readonly featureId: string | null;
	readonly implemented: boolean;
	readonly before: ElementText;
}

const PROSE: HandEditBefore = { featureId: null, implemented: false, before: { text: '', desc: '' } };

const located = (action: ActionImplementationCoverage | undefined) => !!action?.elements?.some((e) => !!e.location?.file);

/** Read before the save: what the element reads and whether its code is located. */
export async function readHandEditBefore(services: AppServices, projectId: string, anchor: string): Promise<HandEditBefore> {
	const [kind, featureId, actionId] = anchor.split(':');
	if (!featureId || (kind !== 'feature' && kind !== 'action')) return PROSE;
	const all: Readonly<Record<string, FeatureImplementationCoverage>> = await services.implementationCoverage.get(projectId).catch(() => ({}));
	const coverage = all[featureId];
	if (kind === 'feature') {
		const feature = (await services.loadFeaturesDraft.execute(projectId)).features.find((f) => f.id === featureId);
		if (!feature) return PROSE;
		const implemented = Object.values<ActionImplementationCoverage>(coverage?.actions ?? {}).some(located);
		return { featureId, implemented, before: { text: feature.name, desc: feature.description } };
	}
	if (!actionId) return PROSE;
	const snapshot = await services.behaviorPort.readFeature(projectId, featureId).catch(() => null);
	const action = indexFeatureActions([{ featureId, snapshot }])[featureId]?.find((a) => a.id === actionId);
	if (!action) return PROSE;
	return { featureId, implemented: located(coverage?.actions?.[actionId]), before: { text: action.name, desc: action.intent } };
}

/** The change the edit makes, read by the same rules the section write applies. */
export function handEditChange(anchor: string, title: string, prior: HandEditBefore, edit: ElementEdit): SpecEditChange {
	const shown = editedFields(prior.before, edit);
	return {
		itemId: anchor,
		title,
		featureId: prior.featureId,
		implemented: prior.implemented,
		before: prior.before,
		after: { text: shown.text, desc: shown.desc }
	};
}
