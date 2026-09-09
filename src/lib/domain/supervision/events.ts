/** Domain events for the Supervision capability. Mirror of feature `3d1cc881`. */
export type SupervisionEvent =
	| { type: 'supervision.field.changed'; field: string }
	| { type: 'supervision.autosaved'; savedAt: string }
	| { type: 'supervision.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'supervision.assignment.added'; assignmentId: string }
	| { type: 'supervision.assignment.updated'; assignmentId: string }
	| { type: 'supervision.assignment.removed'; assignmentId: string }
	| { type: 'supervision.policy.updated'; ruleId: string }
	| { type: 'supervision.decision.logged'; decisionId: string }
	| { type: 'supervision.pace.computed'; teamPace: number };
