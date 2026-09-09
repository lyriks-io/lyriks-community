import {
	createApprovalItem,
	type ApprovalItem,
	type ApprovalStatus,
	type ProjectApprovalsDraft
} from '$domain/approvals';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/** Approvals store — the standard debounced-autosave pattern; pure Lyriks residue. */
export class ApprovalsStore {
	draft = $state<ProjectApprovalsDraft>(null as unknown as ProjectApprovalsDraft);
	filter = $state('');

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectApprovalsDraft>;

	constructor(
		initial: ProjectApprovalsDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/approvals',
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

	filtered = $derived.by<ApprovalItem[]>(() => {
		const q = this.filter.trim().toLowerCase();
		if (!q) return this.draft.items;
		return this.draft.items.filter(
			(i) =>
				i.title.toLowerCase().includes(q) ||
				i.area.toLowerCase().includes(q) ||
				i.reviewer.toLowerCase().includes(q)
		);
	});

	hydrate = (incoming: ProjectApprovalsDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = () => this.#autosave.touch();

	setFilter = (v: string) => {
		this.filter = v;
	};
	addItem = () => {
		this.draft.items = [createApprovalItem(), ...this.draft.items];
		this.#touch();
	};
	updateItem = (id: string, patch: Partial<ApprovalItem>) => {
		this.draft.items = this.draft.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
		this.#touch();
	};
	setStatus = (id: string, status: ApprovalStatus) => this.updateItem(id, { status });
	removeItem = (id: string) => {
		this.draft.items = this.draft.items.filter((i) => i.id !== id);
		this.#touch();
	};
}
