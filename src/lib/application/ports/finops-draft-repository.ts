import type { ProjectFinopsDraft } from '$domain/finops';
import type { SectionDraftRepositoryPort } from './section-documents';

/** Outbound port for persisting AI Cost Governor drafts — a consolidated section-document view. */
export type FinopsDraftRepositoryPort = SectionDraftRepositoryPort<ProjectFinopsDraft>;
