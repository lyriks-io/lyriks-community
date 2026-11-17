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
