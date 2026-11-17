import {
	createDocumentSource,
	DOCUMENT_KINDS,
	sourceAccess,
	type DocumentKind,
	type DocumentSource,
	type ProjectDocumentsDraft
} from '$domain/documents';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { createFilter } from '$ui/design-system';

export type { SaveStatus };

/**
 * Documents & Sources store — the same debounced-autosave pattern as every other
 * section. Pure Lyriks residue (no kernel), so there is nothing to project: every
 * mutator funnels through `#touch` → `PUT /api/draft/documents`.
 */
export class DocumentsStore {
	draft = $state<ProjectDocumentsDraft>(null as unknown as ProjectDocumentsDraft);
	/** The shared list toolbar's state: the search box plus the facets of its Filters panel. */
	readonly filter = createFilter<DocumentSource>({
		fields: (s) => [s.title, s.note, s.url],
		placeholder: 'Filter sources…',
		noun: 'sources',
		facets: [
			{ key: 'kind', label: 'Kind', value: (s) => s.kind, options: DOCUMENT_KINDS.map((k) => ({ value: k.code, label: k.label })) },
			{
				key: 'access',
				label: 'Can be opened',
				value: (s) => sourceAccess(s),
				options: [
					{ value: 'link', label: 'Through a link' },
					{ value: 'inline', label: 'Content only' },
					{ value: 'unreachable', label: 'Nobody can open it' },
					{ value: 'empty', label: 'Nothing filled in' }
				]
			},
			{ key: 'decision', label: 'Technical decisions', kind: 'toggle', value: (s) => !!s.decision },
			{ key: 'evidence', label: 'Test results', kind: 'toggle', value: (s) => !!s.evidence }
		]
	});
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

	filtered = $derived.by<DocumentSource[]>(() => this.filter.apply(this.draft.sources));

	hydrate = (incoming: ProjectDocumentsDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = () => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/** Back to the whole register (what adding a source needs, so the new row shows). */
	clearFilter = () => this.filter.clear();
	/** Filter on one source by its name, as if the author had typed it. */
	filterOn = (id: string) => {
		const source = this.draft.sources.find((s) => s.id === id);
		if (source) this.filter.query = source.title || source.url;
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
