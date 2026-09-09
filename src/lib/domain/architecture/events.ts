/** Domain events for Step 08 — Architecture & stack. Mirror of feature `8c799e4a`. */
export type ArchitectureEvent =
	| { type: 'architecture.changed'; field: string }
	| { type: 'architecture.autosaved'; savedAt: string }
	| { type: 'architecture.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'architecture.tech.added'; techId: string; layer: string }
	| { type: 'architecture.tech.removed'; techId: string }
	| { type: 'architecture.doc.added'; docId: string }
	| { type: 'architecture.doc.removed'; docId: string }
	| { type: 'architecture.constraint.added'; constraintId: string }
	| { type: 'architecture.constraint.removed'; constraintId: string }
	| { type: 'architecture.stack.derived'; created: number }
	| { type: 'architecture.step.completed'; to: string };
