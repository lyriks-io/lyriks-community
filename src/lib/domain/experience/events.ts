/** Domain events for Step 05 — Experience. Mirror of feature `1bf10f8f`. */
export type ExperienceEvent =
	| { type: 'experience.field.changed'; field: string }
	| { type: 'experience.autosaved'; savedAt: string }
	| { type: 'experience.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'experience.journey.added'; journeyId: string; coreId: string }
	| { type: 'experience.journey.removed'; journeyId: string }
	| { type: 'experience.step.added'; stepId: string; journeyId: string }
	| { type: 'experience.step.removed'; stepId: string }
	| { type: 'experience.screen.linked'; stepId: string; screenId: string | null }
	| { type: 'experience.operation.added'; operationId: string; stepId: string }
	| { type: 'experience.data_read.added'; dataReadId: string; stepId: string }
	| { type: 'experience.library.changed'; kind: 'template' | 'screen' | 'component' | 'element' }
	| { type: 'experience.cores.refreshed'; count: number }
	| { type: 'experience.step.completed'; to: string };
