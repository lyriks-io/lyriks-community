/**
 * Domain events emitted by the Foundation capability, mirroring the events
 * registered in the spec for the identity slice (feature `4ad873cc`) and the
 * definition slice (feature `6b9ffe58`). They are the contract between the
 * capability and cross-cutting concerns (auto-save debouncer, coherence
 * scorer, telemetry) — see TelemetryPort.
 */

/** Canonical section identifiers (the `init.field.changed` payload domain). */
export const SECTIONS = [
	'identity',
	'brief',
	'form_factor',
	'methodology',
	'origin',
	'workspace',
	'mode',
	'runtime'
] as const;
export type SectionId = (typeof SECTIONS)[number];

/** Sections an AI suggestion can target (`Suggest From Brief`). */
export type SuggestableSection = 'form_factor';

export type FoundationEvent =
	/* identity slice */
	| { type: 'init.field.changed'; section: SectionId; path: string }
	| { type: 'init.brief.captured' }
	| {
			type: 'init.brief.analyzed';
			suggestedFormFactors?: string[];
			suggestedMarketType?: string;
			suggestedCompetitors?: string[];
	  }
	| { type: 'init.section.suggested'; section: SuggestableSection; itemCount: number }
	| { type: 'foundation.identity.autosaved'; savedAt: string }
	| { type: 'foundation.identity.coherence.computed'; score: number; issues: string[] }
	| { type: 'init.step.completed' }
	| { type: 'init.reset' }
	/* definition slice */
	| { type: 'foundation.definition.field.changed'; field: string }
	| { type: 'foundation.definition.autosaved'; savedAt: string }
	| { type: 'foundation.definition.coherence.computed'; score: number; issues: string[] }
	| { type: 'foundation.definition.tab.switched'; tab: string }
	| { type: 'foundation.definition.step.completed'; to: string };

export type FoundationEventType = FoundationEvent['type'];
