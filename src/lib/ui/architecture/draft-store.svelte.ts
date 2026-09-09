import {
	architectureCanAdvance,
	computeArchitectureCoherence,
	createConstraint,
	createTechChoice,
	missingArchitectureRequirements,
	type ArchLayer,
	type Constraint,
	type ProjectArchitectureDraft,
	type TechChoice
} from '$domain/architecture';
import { toggleCitation } from '$domain/documents';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Step 08 store — orchestrator for the Architecture & Stack screen. Mirror of
 * the Step 06/07 stores: every mutator goes through `#touch` so the auth guard
 * + debounced autosave of feature `8c799e4a` is honored. "Seed" runs
 * client-side over the loaded derivedTech; "Refresh" re-pulls it.
 */
export class ArchitectureStore {
	draft = $state<ProjectArchitectureDraft>(null as unknown as ProjectArchitectureDraft);

	coherence = $derived.by<CoherenceResult>(() => computeArchitectureCoherence(this.draft));
	canAdvance = $derived.by<boolean>(() => architectureCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingArchitectureRequirements(this.draft));

	/** Tech names referenced upstream but not yet on the board (by name+layer). */
	missingTech = $derived.by<string[]>(() => {
		const have = new Set(this.draft.techChoices.map((t) => `${t.layer}:${t.name.trim().toLowerCase()}`));
		return this.draft.derivedTech
			.filter((d) => !have.has(`${d.layer}:${d.name.trim().toLowerCase()}`))
			.map((d) => d.name);
	});

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectArchitectureDraft>;

	constructor(
		initial: ProjectArchitectureDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/architecture',
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

	hydrate = (incoming: ProjectArchitectureDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────────── TECH ──────────────────────────────── */
	addTech = (layer: ArchLayer, overrides: Partial<TechChoice> = {}): string => {
		const t = createTechChoice(layer, overrides);
		this.draft.techChoices.push(t);
		this.#touch('architecture.techChoices');
		return t.id;
	};
	updateTech = <K extends keyof TechChoice>(techId: string, field: K, value: TechChoice[K]) => {
		const t = this.draft.techChoices.find((t) => t.id === techId);
		if (!t) return;
		(t as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('architecture.techChoices');
	};
	/** Point a tech choice at the register row documenting it (or clear it). */
	linkTechToDoc = (techId: string, docId: string | null) =>
		this.updateTech(techId, 'referenceDocId', docId);
	removeTech = (techId: string) => {
		this.draft.techChoices = this.draft.techChoices.filter((t) => t.id !== techId);
		this.#touch('architecture.techChoices');
	};

	/* ────────────────────────────── SOURCES ────────────────────────────── */
	/**
	 * Cite (or un-cite) a row of the project Documents & Sources register.
	 * Architecture no longer keeps its own doc list — the register is the single
	 * source of truth, and this section only links to it.
	 */
	toggleSource = (sourceId: string) => {
		this.draft.sourceIds = toggleCitation(this.draft.sourceIds, sourceId);
		this.#touch('architecture.sourceIds');
	};

	/* ───────────────────────────── CONSTRAINTS ─────────────────────────── */
	addConstraint = (overrides: Partial<Constraint> = {}): string => {
		const c = createConstraint(overrides);
		this.draft.constraints.push(c);
		this.#touch('architecture.constraints');
		if (c.title.trim()) this.notifier.notify('info', `Constraint "${c.title}" added.`);
		return c.id;
	};
	updateConstraint = <K extends keyof Constraint>(id: string, field: K, value: Constraint[K]) => {
		const c = this.draft.constraints.find((c) => c.id === id);
		if (!c) return;
		(c as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('architecture.constraints');
	};
	removeConstraint = (id: string) => {
		this.draft.constraints = this.draft.constraints.filter((c) => c.id !== id);
		this.#touch('architecture.constraints');
	};

	/* ──────────────────── DERIVE / REFRESH FROM UPSTREAM ────────────────── */
	deriveStack = () => {
		const have = new Set(
			this.draft.techChoices.map((t) => `${t.layer}:${t.name.trim().toLowerCase()}`)
		);
		let created = 0;
		for (const d of this.draft.derivedTech) {
			const key = `${d.layer}:${d.name.trim().toLowerCase()}`;
			if (have.has(key)) continue;
			this.draft.techChoices.push(createTechChoice(d.layer, { name: d.name }));
			have.add(key);
			created++;
		}
		if (created > 0) this.#touch('architecture.derive');
		this.notifier.notify(
			'info',
			created > 0
				? `Seeded ${created} tech card${created === 1 ? '' : 's'} from earlier steps.`
				: 'Everything from earlier steps is already on the board.'
		);
	};

	/**
	 * First open of a still-empty board: fill it from upstream automatically so
	 * authors don't face a blank board and a button to discover. Additive to an
	 * EMPTY board, so it can never clobber a curated stack or re-add a deleted card;
	 * the manual "Import" button still covers later upstream additions. Auth-guarded
	 * (deriveStack autosaves), and a no-op the moment the board holds any card.
	 */
	autoDeriveIfEmpty = () => {
		if (!this.session.isAuthenticated) return;
		if (this.draft.techChoices.length > 0) return;
		if (this.missingTech.length === 0) return;
		this.deriveStack();
	};

	refreshDerived = async () => {
		try {
			const res = await fetch(
				`/api/draft/architecture?projectId=${encodeURIComponent(this.draft.projectId)}`
			);
			if (!res.ok) throw new Error(`refresh failed (${res.status})`);
			const { derivedTech } = (await res.json()) as {
				derivedTech: ProjectArchitectureDraft['derivedTech'];
			};
			this.draft.derivedTech = derivedTech;
			this.notifier.notify('info', `Re-read ${derivedTech.length} item(s) from earlier steps.`);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'refresh failed');
		}
	};

	/* ─────────────────────────────── RESET ─────────────────────────────── */
	reset = () => {
		this.draft.techChoices = [];
		this.draft.referenceDocs = [];
		this.draft.constraints = [];
		this.#touch('architecture.reset');
	};
}
