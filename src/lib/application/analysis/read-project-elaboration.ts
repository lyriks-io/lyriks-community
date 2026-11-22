import { analyzeElaboration, elaborationLanguage } from '$domain/elaboration';
import { buildStatusByFeature } from '$domain/features';
import { fingerprint } from '$domain/scope';
import type { ProjectElaborationPorts } from '../ports/project-elaboration';

/** On-demand planning over the current draft; no model or UI state is persisted. */
export class ReadProjectElaborationUseCase {
	constructor(private readonly ports: ProjectElaborationPorts) {}

	async execute(projectId: string, includeChecks = false) {
		const unavailable: string[] = [];
		const read = async <T>(name: string, operation: () => Promise<T>): Promise<T | null> => {
			try { return await operation(); }
			catch { unavailable.push(name); return null; }
		};
		const before = await read('model-revision', () => this.ports.modelRevision.fingerprint(projectId));
		const [foundation, scope, users, features, completion, behavior, coverage] = await Promise.all([
			read('foundation', () => this.ports.foundation.execute(projectId)),
			read('scope', () => this.ports.scope.execute(projectId)),
			read('users', () => this.ports.users.execute(projectId)),
			read('features', () => this.ports.features.execute(projectId)),
			includeChecks ? read('completion', () => this.ports.completion.execute(projectId)) : Promise.resolve(null),
			read('behavior', () => this.ports.behavior.execute(projectId)),
			read('coverage', () => this.ports.coverage.get(projectId))
		]);
		// The domain is handed counts, not the model reading: it may not import the
		// application layer, and a count is all the acceptance question needs.
		const acceptanceCriteriaByFeature = behavior
			? Object.fromEntries(behavior.features.map((f) => [f.featureId, f.acceptanceCriteria.length]))
			: null;
		// Whether a feature is built is what the code holds, read from the index coverage.
		const buildStatus = features && coverage ? buildStatusByFeature(features.features.map((f) => f.id), coverage) : null;
		const [after, latestScope] = await Promise.all([
			read('model-revision', () => this.ports.modelRevision.fingerprint(projectId)),
			read('scope', () => this.ports.scope.execute(projectId))
		]);
		const scopeFingerprint = scope ? fingerprint(scope) : null;
		const stable = unavailable.length === 0 && before !== null && before === after && scopeFingerprint !== null && latestScope !== null && scopeFingerprint === fingerprint(latestScope);
		const input = { foundation, scope, users, features, completion, acceptanceCriteriaByFeature, buildStatusByFeature: buildStatus, unavailable: [...new Set(unavailable)].sort() };
		const lang = elaborationLanguage(input);
		const report = analyzeElaboration(input, lang);
		return {
			projectId,
			...report,
			snapshot: { stable, key: stable ? `${after}:${scopeFingerprint}` : null, unavailable: [...new Set(unavailable)].sort() },
			checks: includeChecks ? completion ? 'read' : 'unavailable' : 'not-requested',
			readOnly: true,
			...(stable ? {} : { warning: lang === 'fr'
				? "Le projet a changé pendant cette lecture, ou sa révision n'a pas pu être établie. Relisez-le avant de vous fier au plan."
				: 'The project changed during this read or its revision could not be established. Read again before relying on the plan.' })
		};
	}
}
