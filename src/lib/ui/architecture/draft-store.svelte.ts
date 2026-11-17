import {
	architectureCanAdvance,
	architectureStage,
	computeArchitectureCoherence,
	createConstraint,
	createTechChoice,
	derivedKey,
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
import { specLanguageAccessor } from '$ui/language/spec-language-context';

export type { SaveStatus };

/**
 * Step 08 store — orchestrator for the Architecture & Stack screen. Mirror of
 * the Step 06/07 stores: every mutator goes through `#touch` so the auth guard
 * + debounced autosave of feature `8c799e4a` is honored. "Seed" runs
 * client-side over the loaded derivedTech; "Refresh" re-pulls it.
 */
export class ArchitectureStore {
	draft = $state<ProjectArchitectureDraft>(null as unknown as ProjectArchitectureDraft);

	/** The spec's language, from the project it is opened in: its checks read in it. */
	readonly #lang = specLanguageAccessor();
	coherence = $derived.by<CoherenceResult>(() => computeArchitectureCoherence(this.draft, this.#lang()));
	canAdvance = $derived.by<boolean>(() => architectureCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingArchitectureRequirements(this.draft));

	/** Tech names referenced upstream, not on the board and not removed by the author. */
	missingTech = $derived.by<string[]>(() => {
		const skip = new Set([
			...this.draft.techChoices.map((t) => derivedKey(t.layer, t.name)),
			...(this.draft.dismissedDerived ?? [])
		]);
		return this.draft.derivedTech
			.filter((d) => !skip.has(derivedKey(d.layer, d.name)))
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

	setStage = (stage: 'logical' | 'implementation') => {
		this.draft.stage = stage;
		this.#touch('architecture.stage');
	};

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
		const removed = this.draft.techChoices.find((t) => t.id === techId);
		this.draft.techChoices = this.draft.techChoices.filter((t) => t.id !== techId);
		// An upstream technology removed by hand stays removed: the automatic
		// take-in below would otherwise bring it straight back.
		if (removed) {
			const key = derivedKey(removed.layer, removed.name);
			const dismissed = this.draft.dismissedDerived ?? [];
			if (this.draft.derivedTech.some((d) => derivedKey(d.layer, d.name) === key) && !dismissed.includes(key))
				this.draft.dismissedDerived = [...dismissed, key];
		}
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
	/**
	 * Take in the stack already declared in Foundation & Data, with no button:
	 * adds what is missing, never overwrites a card and never re-adds one the
	 * author removed (`dismissedDerived`). Logical stage names components, not
	 * technologies, so it waits for implementation decisions. Auth-guarded,
	 * since it autosaves.
	 */
	takeInUpstreamStack = () => {
		if (!this.session.isAuthenticated || architectureStage(this.draft) === 'logical') return;
		const skip = new Set([
			...this.draft.techChoices.map((t) => derivedKey(t.layer, t.name)),
			...(this.draft.dismissedDerived ?? [])
		]);
		let created = 0;
		for (const d of this.draft.derivedTech) {
			const key = derivedKey(d.layer, d.name);
			if (skip.has(key)) continue;
			this.draft.techChoices.push(createTechChoice(d.layer, { name: d.name }));
			skip.add(key);
			created++;
		}
		if (created === 0) return;
		this.#touch('architecture.derive');
		this.notifier.notify(
			'info',
			`Took in ${created} technolog${created === 1 ? 'y' : 'ies'} declared in Foundation & Data.`
		);
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
