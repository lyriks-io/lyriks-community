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
	type ProjectRulesDraft,
	type RulesTab
} from '$domain/rules';
import type { CoherenceResult } from '$domain/shared';
import type { ConsolidatedRule } from '$domain/rules';
import type { Session, ToastNotifierPort } from '$application/ports';
import { browser } from '$app/environment';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Step 06 store — orchestrator for the Rules & Edge Cases screen. Mirror of the
 * Step 02-05 stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `e06f420a` is honored uniformly. Issue scanning
 * is automatic (local heuristics client-side, engine findings via the cached
 * server route — see AUTO-SCAN below); the detected issues surface in the
 * Control Center's coherence panel, never on this screen.
 */
export class RulesStore {
	draft = $state<ProjectRulesDraft>(null as unknown as ProjectRulesDraft);
	activeTab = $state<RulesTab>('inventory');

	coherence = $derived.by<CoherenceResult>(() => computeRulesCoherence(this.draft));
	canAdvance = $derived.by<boolean>(() => rulesCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingRulesRequirements(this.draft));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectRulesDraft>;

	constructor(
		initial: ProjectRulesDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
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

	switchTab = (tab: RulesTab) => {
		this.activeTab = tab;
	};

	/* ─────────────────────────── AUTO-SCAN ─────────────────────────────── */
	// Issues appear (and retire) on their own: a quiet scan runs after load and
	// after every live-sync hydrate (upstream rule edits and the behavior
	// engine's cached findings both arrive that way). Idempotent — candidates
	// dedup against the stored list by title, and a scan that changes nothing
	// never touches the draft, so the save → sync → hydrate → scan cycle
	// converges instead of looping. The issues themselves render only in the
	// Control Center's coherence panel.
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
		const candidates: CandidateIssue[] = detectIssues(this.draft.inventory);
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

		// Self-healing: with no triage board, an open auto-detected issue the scan
		// no longer reports has been fixed upstream — retire it so the Control
		// Center list converges with reality. Only when the engine answered
		// (an offline engine would flap its findings out and back in); manually
		// authored issues are never touched.
		if (engineAnswered) {
			const stillReported = new Set(candidates.map((c) => c.title.trim().toLowerCase()));
			this.draft.issues = this.draft.issues.filter(
				(i) =>
					!(i.autoDetected && i.status === 'open' && !stillReported.has(i.title.trim().toLowerCase()))
			);
		}
		const removed = before - this.draft.issues.length;

		const seenTitles = new Set(this.draft.issues.map((i) => i.title.trim().toLowerCase()));
		let added = 0;
		for (const c of candidates) {
			const title = c.title.trim().toLowerCase();
			if (seenTitles.has(title)) continue;
			seenTitles.add(title);
			added += 1;
			this.draft.issues.push(
				createIssue({
					kind: c.kind,
					title: c.title,
					detail: c.detail,
					severity: c.severity,
					relatedRuleIds: c.relatedRuleIds,
					autoDetected: true
				})
			);
		}
		if (added > 0 || removed > 0) {
			this.#touch('rules.autoscan');
			const bits = [
				added > 0 ? `flagged ${added} new issue${added === 1 ? '' : 's'}` : '',
				removed > 0 ? `retired ${removed} outdated auto issue${removed === 1 ? '' : 's'}` : ''
			].filter(Boolean);
			this.notifier.notify('info', `Scan ${bits.join(', ')}.`);
		}
	};

	/** Re-pull the read-only inventory from the earlier steps. */
	refreshInventory = async () => {
		try {
			const res = await fetch(
				`/api/draft/rules?projectId=${encodeURIComponent(this.draft.projectId)}`
			);
			if (!res.ok) throw new Error(`refresh failed (${res.status})`);
			const { inventory } = (await res.json()) as { inventory: ConsolidatedRule[] };
			this.draft.inventory = inventory;
			this.notifier.notify('info', `Rules refreshed from earlier steps (${inventory.length}).`);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'refresh failed');
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
