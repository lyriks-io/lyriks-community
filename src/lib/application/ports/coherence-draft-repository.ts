import type { ProjectCoherenceDraft } from '$domain/coherence';
import type { SectionDraftRepositoryPort } from './section-documents';

/** Outbound port for persisting Step 09 authored state. Parallel to Steps 01-08. */
export interface CoherenceDraftRepositoryPort
	extends SectionDraftRepositoryPort<ProjectCoherenceDraft> {}
