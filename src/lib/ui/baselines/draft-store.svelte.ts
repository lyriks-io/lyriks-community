import type { Baseline, ProjectBaselinesDraft } from '$domain/baselines';
import type { Session, ToastNotifierPort } from '$application/ports';
import { clientId } from '$ui/shell/live-sync.client';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { REVISION_HEADER } from '$lib/shared/draft-revision';

export type { SaveStatus };

/**
 * Baselines store. Edits (rename/note) and deletes autosave via PUT like every
 * other section; capturing a new baseline is a server POST (it snapshots the
 * whole envelope) whose result replaces the local draft.
 */
export class BaselinesStore {
	draft = $state<ProjectBaselinesDraft>(null as unknown as ProjectBaselinesDraft);
	capturing = $state(false);

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectBaselinesDraft>;

	constructor(
		initial: ProjectBaselinesDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/baselines',
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

	hydrate = (incoming: ProjectBaselinesDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = () => this.#autosave.touch();

	capture = async (name: string, note: string) => {
		if (!this.session.isAuthenticated) {
			this.notifier.notify('error', 'Sign in to capture a baseline.');
			return;
		}
		this.capturing = true;
		try {
			const res = await fetch(
				`/api/projects/${encodeURIComponent(this.draft.projectId)}/baselines/capture`,
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'x-lyriks-client': clientId,
						[REVISION_HEADER]: String(this.#autosave.revision)
					},
					body: JSON.stringify({ name, note })
				}
			);
			if (!res.ok) throw new Error(`capture failed (${res.status})`);
			const { draft, revision } = (await res.json()) as {
				draft: ProjectBaselinesDraft;
				revision: number;
			};
			this.#autosave.adoptSaved(draft, revision);
			this.notifier.notify('info', `Baseline "${name.trim() || 'Untitled baseline'}" captured.`);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'capture failed');
		} finally {
			this.capturing = false;
		}
	};

	updateBaseline = (id: string, patch: Partial<Pick<Baseline, 'name' | 'note'>>) => {
		this.draft.baselines = this.draft.baselines.map((b) => (b.id === id ? { ...b, ...patch } : b));
		this.#touch();
	};

	remove = (id: string) => {
		this.draft.baselines = this.draft.baselines.filter((b) => b.id !== id);
		this.#touch();
	};
}
