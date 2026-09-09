import {
	computeGlossaryCoherence,
	computeGlossaryHealth,
	createTerm,
	suggestGlossaryTerms,
	type GlossaryLocale,
	type GlossaryTerm,
	type ProjectGlossaryDraft
} from '$domain/glossary';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { toggleCitation } from '$domain/documents';

export type { SaveStatus };

/**
 * Glossary store — orchestrator for the vocabulary screen. Mirror of the other
 * section stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `297051ca` is honored uniformly. Health and
 * brief-mined suggestions are derived live from the terms plus the upstream
 * corpus passed in at construction.
 */
export class GlossaryStore {
	draft = $state<ProjectGlossaryDraft>(null as unknown as ProjectGlossaryDraft);
	filter = $state('');
	showAvoidOnly = $state(false);
	selectedTermId = $state<string | null>(null);
	readonly corpus: string;

	coherence = $derived.by<CoherenceResult>(() => computeGlossaryCoherence(this.draft));
	health = $derived.by(() => computeGlossaryHealth(this.draft.terms, this.corpus));
	suggestions = $derived.by(() => suggestGlossaryTerms(this.corpus, this.draft.terms));

	/** The terms matching the active search + banned-only filter, in author order. */
	filtered = $derived.by<GlossaryTerm[]>(() => {
		const q = this.filter.trim().toLowerCase();
		return this.draft.terms.filter((t) => {
			if (this.showAvoidOnly && t.synonymsAvoid.length === 0) return false;
			if (!q) return true;
			return (
				t.term.toLowerCase().includes(q) ||
				t.definition.toLowerCase().includes(q) ||
				t.synonymsAllowed.some((s) => s.toLowerCase().includes(q)) ||
				t.synonymsAvoid.some((s) => s.toLowerCase().includes(q))
			);
		});
	});

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectGlossaryDraft>;

	constructor(
		initial: ProjectGlossaryDraft,
		corpus: string,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.corpus = corpus;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/glossary',
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

	hydrate = (incoming: ProjectGlossaryDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────────── FILTER ────────────────────────────── */
	setFilter = (filter: string) => {
		this.filter = filter;
	};

	toggleAvoidOnly = () => {
		this.showAvoidOnly = !this.showAvoidOnly;
	};

	selectTerm = (termId: string | null) => {
		this.selectedTermId = this.selectedTermId === termId ? null : termId;
	};

	/* ──────────────────────────────── TERMS ────────────────────────────── */
	addTerm = (overrides: Partial<GlossaryTerm> = {}): string => {
		const term = createTerm(overrides);
		this.draft.terms.push(term);
		this.selectedTermId = term.id;
		this.#touch('glossary.terms');
		if (term.term.trim()) this.notifier.notify('info', `Term "${term.term}" added to the glossary.`);
		return term.id;
	};

	/** Add a named term unless it already exists (used by the suggestion strip). */
	addNamedTerm = (name: string): string | null => {
		const exists = this.draft.terms.some(
			(t) => t.term.trim().toLowerCase() === name.trim().toLowerCase()
		);
		if (exists) return null;
		return this.addTerm({ term: name, locale: 'en' });
	};

	updateTerm = <K extends keyof GlossaryTerm>(termId: string, field: K, value: GlossaryTerm[K]) => {
		const t = this.draft.terms.find((t) => t.id === termId);
		if (!t) return;
		(t as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('glossary.terms');
	};

	/** Cite (or un-cite) a Documents & Sources row that defines this term. */
	toggleTermSource = (termId: string, sourceId: string) => {
		const term = this.draft.terms.find((t) => t.id === termId);
		if (!term) return;
		this.updateTerm(termId, 'sourceIds', toggleCitation(term.sourceIds, sourceId));
	};

	setLocale = (termId: string, locale: GlossaryLocale) =>
		this.updateTerm(termId, 'locale', locale);

	setAllowedSynonyms = (termId: string, list: string[]) =>
		this.updateTerm(termId, 'synonymsAllowed', list);

	setBannedSynonyms = (termId: string, list: string[]) =>
		this.updateTerm(termId, 'synonymsAvoid', list);

	toggleApproved = (termId: string) => {
		const t = this.draft.terms.find((t) => t.id === termId);
		if (!t) return;
		t.status = t.status === 'approved' ? 'draft' : 'approved';
		this.#touch('glossary.terms');
	};

	removeTerm = (termId: string) => {
		this.draft.terms = this.draft.terms.filter((t) => t.id !== termId);
		if (this.selectedTermId === termId) this.selectedTermId = null;
		this.#touch('glossary.terms');
	};
}
