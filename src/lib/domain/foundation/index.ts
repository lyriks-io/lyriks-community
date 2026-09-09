/* Shared cross-context types, re-exported so Foundation consumers import one module. */
export type { CoherenceIssue, CoherenceResult, CoherenceTone, CustomizableCode, Option } from '$domain/shared';

export * from './altitude';
export * from './identity-enums';
export * from './identity';
export * from './identity-coherence';
export * from './kickoff-prompt';
export * from './definition-enums';
export * from './definition';
export * from './definition-coherence';
export * from './operations-enums';
export * from './operations';
export * from './operations-coherence';
export * from './seed';
export * from './can-advance';
export * from './events';
export * from './validation';
export type { ProjectFoundationDraft } from './draft';
