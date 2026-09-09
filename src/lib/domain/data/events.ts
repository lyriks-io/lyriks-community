/** Domain events for Step 07 — Data & flows. Mirror of feature `c5380392`. */
export type DataEvent =
	| { type: 'data.changed'; field: string }
	| { type: 'data.autosaved'; savedAt: string }
	| { type: 'data.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'data.entity.added'; entityId: string }
	| { type: 'data.entity.removed'; entityId: string }
	| { type: 'data.entity_field.added'; fieldId: string; entityId: string }
	| { type: 'data.relation.changed'; fieldId: string }
	| { type: 'data.host.changed'; hostId: string }
	| { type: 'data.database.changed'; databaseId: string }
	| { type: 'data.interface.added'; interfaceId: string }
	| { type: 'data.pipeline.added'; pipelineId: string }
	| { type: 'data.entities.derived'; created: number }
	| { type: 'data.step.completed'; to: string };
