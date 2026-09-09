import {
	createDocumentSource,
	type DocumentKind,
	type DocumentSource,
	type ProjectDocumentsDraft
} from '$domain/documents';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Documents & Sources store — the same debounced-autosave pattern as every other
 * section. Pure Lyriks residue (no kernel), so there is nothing to project: every
 * mutator funnels through `#touch` → `PUT /api/draft/documents`.
 */
export class DocumentsStore {
	draft = $state<ProjectDocumentsDraft>(null as unknown as ProjectDocumentsDraft);
	filter = $state('');
	selectedId = $state<string | null>(null);

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectDocumentsDraft>;

	constructor(
		initial: ProjectDocumentsDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
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

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	filtered = $derived.by<DocumentSource[]>(() => {
		const q = this.filter.trim().toLowerCase();
		if (!q) return this.draft.sources;
		return this.draft.sources.filter(
			(s) =>
				s.title.toLowerCase().includes(q) ||
				s.note.toLowerCase().includes(q) ||
				s.url.toLowerCase().includes(q)
		);
	});

	hydrate = (incoming: ProjectDocumentsDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = () => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	setFilter = (v: string) => {
		this.filter = v;
	};
	select = (id: string | null) => {
		this.selectedId = id;
	};
	/** Append a blank row and return its id, so the caller can focus it. */
	addSource = (): string => {
		const source = createDocumentSource();
		this.draft.sources = [...this.draft.sources, source];
		this.selectedId = source.id;
		this.#touch();
		return source.id;
	};
	updateSource = (id: string, patch: Partial<DocumentSource>) => {
		this.draft.sources = this.draft.sources.map((s) => (s.id === id ? { ...s, ...patch } : s));
		this.#touch();
	};
	setKind = (id: string, kind: DocumentKind) => this.updateSource(id, { kind });
	removeSource = (id: string) => {
		this.draft.sources = this.draft.sources.filter((s) => s.id !== id);
		if (this.selectedId === id) this.selectedId = null;
		this.#touch();
	};
}
