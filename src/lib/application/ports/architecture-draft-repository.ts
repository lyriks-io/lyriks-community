import type { ProjectArchitectureDraft } from '$domain/architecture';
import type { SectionDraftRepositoryPort } from './section-documents';

/** Outbound port for persisting Step 08 drafts — a consolidated section-document view. */
export type ArchitectureDraftRepositoryPort = SectionDraftRepositoryPort<ProjectArchitectureDraft>;
