import type { FoundationOperationsDraft } from '$domain/foundation';
import type { SectionDraftRepositoryPort } from './section-documents';

/** Outbound port for persisting Foundation operations drafts — a consolidated section-document view. */
export type FoundationOperationsRepositoryPort = SectionDraftRepositoryPort<FoundationOperationsDraft>;
