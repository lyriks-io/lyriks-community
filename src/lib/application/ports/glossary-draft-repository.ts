import type { ProjectGlossaryDraft } from '$domain/glossary';
import type { SectionDraftRepositoryPort } from './section-documents';

/** Outbound port for persisting Glossary drafts — a consolidated section-document view. */
export type GlossaryDraftRepositoryPort = SectionDraftRepositoryPort<ProjectGlossaryDraft>;
