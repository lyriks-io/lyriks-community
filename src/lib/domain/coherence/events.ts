/** Domain events for Step 09 — Global coherence. Mirror of feature `fde7bb20`. */
export type CoherenceEvent =
	| { type: 'coherence.changed'; field: string }
	| { type: 'coherence.autosaved'; savedAt: string }
	| { type: 'coherence.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'coherence.checked'; readinessScore: number; gapCount: number }
	| { type: 'coherence.readiness.computed'; score: number }
	| { type: 'coherence.gap.acknowledged'; gapId: string }
	| { type: 'coherence.gap.opened'; gapId: string; sourceStep: string }
	| { type: 'coherence.specs.generated'; artifactCount: number }
	| { type: 'coherence.step.completed'; to: string };
