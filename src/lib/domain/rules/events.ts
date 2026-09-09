/** Domain events for Step 06 — Rules And Edge Cases. Mirror of feature `e06f420a`. */
export type RulesEvent =
	| { type: 'rules.field.changed'; field: string }
	| { type: 'rules.autosaved'; savedAt: string }
	| { type: 'rules.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'rules.issue.added'; issueId: string; kind: string }
	| { type: 'rules.issue.updated'; issueId: string }
	| { type: 'rules.issue.resolved'; issueId: string }
	| { type: 'rules.issue.removed'; issueId: string }
	| { type: 'rules.edge_case.added'; edgeCaseId: string }
	| { type: 'rules.edge_case.removed'; edgeCaseId: string }
	| { type: 'rules.inventory.refreshed'; count: number }
	| { type: 'rules.rescan.completed'; added: number }
	| { type: 'rules.step.completed'; to: string };
