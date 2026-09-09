import { getContext, setContext } from 'svelte';
import {
	createDocumentSource,
	type DocumentSource,
	type ProjectDocumentsDraft
} from '$domain/documents';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave } from '$ui/shell/section-autosave.svelte';

/**
 * The project evidence register, live and project-wide.
 *
 * Citing is the common gesture and registering a source is part of it, so the
 * register is provided once by the project layout instead of being threaded
 * page by page: any `SourceCitations` deeper in the tree reads the same rows and
 * can add to them WITHOUT navigating away to the Documents page. Writes go
 * through the standard section autosave (`PUT /api/draft/documents`), flushed
 * immediately — creating a source is a deliberate act, not a keystroke.
 *
 * The Documents page keeps its own editing store; both hydrate from live-sync
 * after either writes, so the two never drift.
 */
const KEY = Symbol('document-registry');

export class DocumentRegistry {
	draft = $state<ProjectDocumentsDraft>(null as unknown as ProjectDocumentsDraft);

	readonly #autosave: SectionAutosave<ProjectDocumentsDraft>;
	readonly #session: Session;

	constructor(
		initial: ProjectDocumentsDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.#session = session;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/documents',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
	}

	get sources(): DocumentSource[] {
		return this.draft.sources;
	}

	/** False in a read-only/unauthenticated session — the inline form hides itself. */
	get canCreate(): boolean {
		return this.#session.isAuthenticated;
	}

	get documentsHref(): string {
		return `/projects/${this.draft.projectId}/documents`;
	}

	hydrate = (incoming: ProjectDocumentsDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	/**
	 * Register a source and return it, so the caller can cite it in the same
	 * gesture. Saved immediately rather than on the autosave debounce: the id has
	 * to survive a reload before anything is allowed to point at it.
	 */
	create = async (fields: Partial<DocumentSource>): Promise<DocumentSource> => {
		const source = createDocumentSource(fields);
		this.draft.sources.push(source);
		this.#autosave.touch();
		await this.#autosave.flushNow();
		return source;
	};
}

export function setDocumentRegistry(registry: DocumentRegistry): void {
	setContext(KEY, registry);
}

/**
 * The register for the current project, or null outside a project shell (so a
 * citation control can degrade to read-only instead of crashing).
 */
export function getDocumentRegistry(): DocumentRegistry | null {
	return getContext<DocumentRegistry | undefined>(KEY) ?? null;
}
