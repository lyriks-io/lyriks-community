/** Domain events for the Glossary capability. Mirror of feature `297051ca`. */
export type GlossaryEvent =
	| { type: 'glossary.field.changed'; field: string }
	| { type: 'glossary.autosaved'; savedAt: string }
	| { type: 'glossary.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'glossary.term.added'; termId: string }
	| { type: 'glossary.term.updated'; termId: string }
	| { type: 'glossary.term.approved'; termId: string }
	| { type: 'glossary.term.removed'; termId: string }
	| { type: 'glossary.suggestions.refreshed'; count: number }
	| { type: 'glossary.health.computed'; score: number };
