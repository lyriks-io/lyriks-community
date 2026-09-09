import type { ProjectSupervisionDraft } from '$domain/supervision';
import type { SectionDraftRepositoryPort } from './section-documents';

/** Outbound port for persisting Supervision drafts — a consolidated section-document view. */
export type SupervisionDraftRepositoryPort = SectionDraftRepositoryPort<ProjectSupervisionDraft>;
