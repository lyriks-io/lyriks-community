import type { AppServices } from '$composition/container.server';
import type { PersonRef } from '$domain/retrospec';
import { saveRetrospecActs } from '$application/retrospec/retrospec-store';

/**
 * What follows a behaviour batch saved on a feature, whoever wrote it (the MCP
 * through POST /api/behavior/apply, or Lyriks writing a validated change of a
 * Reverse-Specification): all in the background, a failure of one never failing
 * the write.
 */
export function behaviorWritten(services: AppServices, projectId: string, featureId: string, actor: Promise<PersonRef> | PersonRef): void {
	// Surfaces, actions and scenarios are what the formal graph is made of: the back must see them.
	void services.scheduleBackSync(projectId).catch(() => {});
	// New states may be the ones that hold data fields: Lyriks links the certain ones and regenerates the data rules.
	void services.syncDataRules.execute(projectId).catch((err) => console.warn('[data rules] sync failed:', err));
	// The Rules tab then reads the feature's rule verdicts at once: the engine keeps the proof by content.
	void services.proveFeatureRules.warm(projectId, featureId).catch((err) => console.warn('[rule proofs] warm failed:', err));
	// The behaviour engine checks what was just written now, not at the next read (ac-leaf-ac-score-engine-reaches-all).
	services.behaviorAdvisories.touch?.(projectId);
	// The feature now does something: a retrospecification under way counts it in its progress (recorded once).
	void Promise.resolve(actor)
		.then((by) => saveRetrospecActs(services.sectionDocuments, projectId, [{ op: 'behavior_authored', featureId }], { actor: by, now: new Date().toISOString() }, null))
		.catch((err) => console.warn('[retrospec] behaviour not recorded:', err));
}
