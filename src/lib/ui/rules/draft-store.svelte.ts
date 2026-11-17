import {
	computeRulesCoherence,
	createEdgeCase,
	createIssue,
	detectIssues,
	missingRulesRequirements,
	rulesCanAdvance,
	type EdgeCase,
	type EdgeOutcome,
	type CandidateIssue,
	type Issue,
	type ProjectRulesDraft,
} from '$domain/rules';
import type { CoherenceResult } from '$domain/shared';
import type { ConsolidatedRule } from '$domain/rules';
import type { Session, ToastNotifierPort } from '$application/ports';
import { browser } from '$app/environment';
import type { SpecLanguage } from '$domain/language';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Step 06 store — orchestrator for the Rules & Edge Cases screen. Mirror of the
 * Step 02-05 stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `e06f420a` is honored uniformly. Issue scanning
 * is automatic (local heuristics client-side, engine findings via the cached
 * server route — see AUTO-SCAN below); the detected issues surface in the
 * What Lyriks noticed, never on this screen.
 */
export class RulesStore {
	draft = $state<ProjectRulesDraft>(null as unknown as ProjectRulesDraft);

	coherence = $derived.by<CoherenceResult>(() => computeRulesCoherence(this.draft, this.lang));
	canAdvance = $derived.by<boolean>(() => rulesCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingRulesRequirements(this.draft));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	/** The spec's language: the issues the scan files are written in it. */
	readonly lang: SpecLanguage;
	readonly #autosave: SectionAutosave<ProjectRulesDraft>;

	constructor(
		initial: ProjectRulesDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0,
		lang: SpecLanguage = 'en'
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.lang = lang;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/rules',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
		this.#scheduleScan();
	}

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	/** Re-seed from a fresh server `load` (after live-sync's invalidateAll). */
	hydrate = (incoming: ProjectRulesDraft, revision = 0) => {
		this.#autosave.hydrate(incoming, revision);
		// Upstream rule edits and the engine's advisory cache both arrive through
		// hydrate, so this is the one trigger the automatic scan needs.
		this.#scheduleScan();
	};

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────── AUTO-SCAN ─────────────────────────────── */
	// Issues appear (and retire) on their own: a quiet scan runs after load and
	// after every live-sync hydrate (upstream rule edits and the behavior
	// engine's cached findings both arrive that way). Idempotent — candidates
	// dedup against the stored list by title, and a scan that changes nothing
	// never touches the draft, so the save → sync → hydrate → scan cycle
	// converges instead of looping. The issues themselves render only in the
	// What Lyriks noticed.
	#scanTimer: ReturnType<typeof setTimeout> | null = null;

	#scheduleScan = () => {
		// Client-only (the store is also constructed during SSR) and edit-capable
		// only — appending issues goes through the auth-guarded autosave.
		if (!browser || !this.session.isAuthenticated) return;
		if (this.#scanTimer) clearTimeout(this.#scanTimer);
		this.#scanTimer = setTimeout(() => void this.#scan(), 800);
	};

	/**
	 * Local heuristics over the inventory + the engine's verify findings (cached
	 * server-side), appended when new. Silent unless something was found.
	 */
	#scan = async () => {
		const candidates: CandidateIssue[] = detectIssues(this.draft.inventory, this.lang);
		let engineAnswered = false;
		try {
			const res = await fetch(
				`/api/draft/rules/engine-issues?projectId=${encodeURIComponent(this.draft.projectId)}`
			);
			if (res.ok) {
				const body = (await res.json()) as { available: boolean; findings: CandidateIssue[] };
				engineAnswered = body.available;
				candidates.push(...body.findings);
			}
		} catch {
			/* engine unreachable — the local heuristics still ran */
		}

		// Migration: the engine used to file one opaque "Behavior gaps — <feature>"
		// card per feature. Those are superseded by per-gap issues with the actual
		// reason in the title; drop untouched leftovers (auto-detected, still open)
		// so the list doesn't keep a wall of cards that say nothing.
		const legacyBlob = (title: string) => /^behavior gaps — /i.test(title.trim());
		const before = this.draft.issues.length;
		this.draft.issues = this.draft.issues.filter(
			(i) => !(i.autoDetected && i.status === 'open' && legacyBlob(i.title))
		);

		const legacyRemoved = before - this.draft.issues.length;

		const merged = mergeScanFindings(this.draft.issues, candidates, engineAnswered);
		this.draft.issues = merged.issues;
		const removed = legacyRemoved + merged.retired;
		const added = merged.added;

		if (added > 0 || removed > 0 || merged.keyed > 0) this.#touch('rules.autoscan');
		if (added > 0 || removed > 0) {
			const bits = [
				added > 0 ? `flagged ${added} new issue${added === 1 ? '' : 's'}` : '',
				removed > 0 ? `retired ${removed} outdated auto issue${removed === 1 ? '' : 's'}` : ''
			].filter(Boolean);
			this.notifier.notify('info', `Scan ${bits.join(', ')}.`);
		}
	};

	/* ────────────────────────────── EDGE CASES ─────────────────────────── */
	addEdgeCase = (overrides: Partial<EdgeCase> = {}): string => {
		const ec = createEdgeCase(overrides);
		this.draft.scenarios.push(ec);
		this.#touch('rules.scenarios');
		if (ec.title.trim()) this.notifier.notify('info', `Edge case "${ec.title}" added.`);
		return ec.id;
	};

	updateEdgeCase = <K extends keyof EdgeCase>(edgeCaseId: string, field: K, value: EdgeCase[K]) => {
		const s = this.draft.scenarios.find((s) => s.id === edgeCaseId);
		if (!s) return;
		(s as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('rules.scenarios');
	};

	setEdgeOutcome = (edgeCaseId: string, outcome: EdgeOutcome) =>
		this.updateEdgeCase(edgeCaseId, 'expectedOutcome', outcome);

	linkEdgeToIssue = (edgeCaseId: string, issueId: string | null) =>
		this.updateEdgeCase(edgeCaseId, 'relatedIssueId', issueId);

	/** Moves a case onto the feature it tests; null = the product as a whole. */
	moveEdgeCase = (edgeCaseId: string, featureId: string | null) =>
		this.updateEdgeCase(edgeCaseId, 'relatedFeatureId', featureId);

	toggleCovered = (edgeCaseId: string) => {
		const s = this.draft.scenarios.find((s) => s.id === edgeCaseId);
		if (!s) return;
		s.covered = !s.covered;
		this.#touch('rules.scenarios');
	};

	removeEdgeCase = (edgeCaseId: string) => {
		this.draft.scenarios = this.draft.scenarios.filter((s) => s.id !== edgeCaseId);
		this.#touch('rules.scenarios');
	};

	/* ─────────────────────────────── RESET ─────────────────────────────── */
	reset = () => {
		this.draft.issues = [];
		this.draft.scenarios = [];
		this.#touch('rules.reset');
	};
}

/**
 * Fold one scan's findings into the stored issues. An auto-detected issue is
 * recognised by its `detectionKey` (what it is about), so the same finding
 * written in another language is the SAME open issue, never a retired one plus
 * a duplicate. An issue stored before the key existed is matched by title
 * once, and adopts the key of the finding it matches.
 *
 * Self-healing: with no triage board, an open auto-detected issue the scan no
 * longer reports has been fixed upstream, so it retires. Only when the engine
 * answered (an offline engine would flap its findings out and back in);
 * manually authored issues are never touched.
 */
export function mergeScanFindings(
	stored: Issue[],
	candidates: CandidateIssue[],
	engineAnswered: boolean
): { issues: Issue[]; added: number; retired: number; keyed: number } {
	const titleOf = (text: string) => text.trim().toLowerCase();
	const candidateByTitle = new Map(candidates.map((c) => [titleOf(c.title), c]));
	let keyed = 0;
	let issues = stored.map((issue) => {
		if (!issue.autoDetected || issue.detectionKey) return issue;
		const match = candidateByTitle.get(titleOf(issue.title));
		if (!match) return issue;
		keyed += 1;
		return { ...issue, detectionKey: match.key };
	});

	const reportedKeys = new Set(candidates.map((c) => c.key));
	const reportedTitles = new Set(candidates.map((c) => titleOf(c.title)));
	const stillReported = (issue: Issue) =>
		issue.detectionKey ? reportedKeys.has(issue.detectionKey) : reportedTitles.has(titleOf(issue.title));
	let retired = 0;
	if (engineAnswered) {
		const before = issues.length;
		issues = issues.filter((i) => !(i.autoDetected && i.status === 'open' && !stillReported(i)));
		retired = before - issues.length;
	}

	const seenKeys = new Set(issues.flatMap((i) => (i.detectionKey ? [i.detectionKey] : [])));
	const seenTitles = new Set(issues.map((i) => titleOf(i.title)));
	let added = 0;
	for (const c of candidates) {
		if (seenKeys.has(c.key) || seenTitles.has(titleOf(c.title))) continue;
		seenKeys.add(c.key);
		seenTitles.add(titleOf(c.title));
		added += 1;
		issues.push(
			createIssue({
				kind: c.kind,
				title: c.title,
				detail: c.detail,
				severity: c.severity,
				relatedRuleIds: c.relatedRuleIds,
				autoDetected: true,
				detectionKey: c.key
			})
		);
	}
	return { issues, added, retired, keyed };
}
