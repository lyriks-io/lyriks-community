import {
	ASSIGNMENT_STATUS_ORDER,
	computeSupervisionCoherence,
	computeTeamPace,
	createAssignment,
	createDecision,
	createGatewayKey,
	createPolicyRule,
	deriveMemberGateway,
	detectRisks,
	gatewayAlerts,
	gatewayTotals,
	progressForStatus,
	type Assignment,
	type AssignmentStatus,
	type Decision,
	type MemberGatewayView,
	type RosterMember,
	type PolicyRule,
	type PolicyStatus,
	type ProjectSupervisionDraft,
	type ScopeType,
	type SupervisionTab
} from '$domain/supervision';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { clientId } from '$ui/shell/live-sync.client';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { REVISION_HEADER } from '$lib/shared/draft-revision';

export type { SaveStatus };

/**
 * Supervision store — orchestrator for the team-pilot screen. Mirror of the
 * other section stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `3d1cc881` is honored uniformly. Team pace,
 * rhythm risks and policy compliance are derived live from the board.
 */
export class SupervisionStore {
	draft = $state<ProjectSupervisionDraft>(null as unknown as ProjectSupervisionDraft);
	activeTab = $state<SupervisionTab>('tasks');

	coherence = $derived.by<CoherenceResult>(() => computeSupervisionCoherence(this.draft));
	pace = $derived.by(() => computeTeamPace(this.draft.assignments));
	risks = $derived.by(() => detectRisks(this.draft.assignments, this.pace));
	unassigned = $derived.by<Assignment[]>(() => this.draft.assignments.filter((a) => !a.assignee));

	/** AI policy compliance: how many rules are compliant, as a 0-100 score. */
	compliance = $derived.by(() => {
		const rules = this.draft.policyRules;
		if (rules.length === 0) return 100;
		return Math.round((rules.filter((r) => r.status === 'ok').length / rules.length) * 100);
	});

	/**
	 * The real workspace roster (lyriks-back collaborators) the gateway attributes
	 * AI usage to. Set by the page from `data.team`; falls back to board assignees
	 * when no back is wired. Drives the per-member rollup below.
	 */
	roster = $state<RosterMember[]>([]);

	/** Per-member AI-usage rollup, keyed by real member identity. */
	memberGateway = $derived.by<MemberGatewayView[]>(() =>
		deriveMemberGateway(
			this.draft.projectId,
			this.roster,
			this.draft.memberKeys,
			this.draft.gatewayAudit
		)
	);
	gatewayTotals = $derived.by(() => gatewayTotals(this.memberGateway));
	gatewayAlerts = $derived.by(() => gatewayAlerts(this.memberGateway));

	/** True when a real LiteLLM proxy is wired server-side (env-gated). */
	gatewayConfigured = $state<boolean>(false);

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectSupervisionDraft>;

	constructor(
		initial: ProjectSupervisionDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0,
		gatewayConfigured = false
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.gatewayConfigured = gatewayConfigured;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/supervision',
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

	hydrate = (incoming: ProjectSupervisionDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	switchTab = (tab: SupervisionTab) => {
		this.activeTab = tab;
	};

	/* ─────────────────────────────── TASKS ─────────────────────────────── */
	assignScope = (input: {
		assignee?: string;
		scopeLabel: string;
		scopeType?: ScopeType;
		dueInDays?: number;
	}): string | null => {
		if (!input.scopeLabel.trim()) return null;
		const a = createAssignment({
			assignee: (input.assignee ?? '').trim(),
			scopeLabel: input.scopeLabel.trim(),
			scopeType: input.scopeType ?? 'step',
			dueInDays: input.dueInDays ?? 3
		});
		this.draft.assignments.push(a);
		this.#touch('supervision.assignments');
		this.notifier.notify(
			'info',
			a.assignee
				? `"${a.scopeLabel}" assigned to ${a.assignee}, due in ${a.dueInDays} day${a.dueInDays === 1 ? '' : 's'}.`
				: `Assignment on "${a.scopeLabel}" created, due in ${a.dueInDays} day${a.dueInDays === 1 ? '' : 's'}; no assignee yet.`
		);
		return a.id;
	};

	setAssignmentOwner = (assignmentId: string, assignee: string) => {
		const a = this.draft.assignments.find((a) => a.id === assignmentId);
		if (!a) return;
		a.assignee = assignee.trim();
		a.updatedAt = 'just now';
		this.#touch('supervision.assignments');
	};

	advanceAssignmentStatus = (assignmentId: string) => {
		const a = this.draft.assignments.find((a) => a.id === assignmentId);
		if (!a) return;
		const next =
			ASSIGNMENT_STATUS_ORDER[
				(ASSIGNMENT_STATUS_ORDER.indexOf(a.status) + 1) % ASSIGNMENT_STATUS_ORDER.length
			];
		a.status = next;
		a.progress = progressForStatus(next, a.progress);
		a.updatedAt = 'just now';
		this.#touch('supervision.assignments');
	};

	setAssignmentStatus = (assignmentId: string, status: AssignmentStatus) => {
		const a = this.draft.assignments.find((a) => a.id === assignmentId);
		if (!a) return;
		a.status = status;
		a.progress = progressForStatus(status, a.progress);
		a.updatedAt = 'just now';
		this.#touch('supervision.assignments');
	};

	removeAssignment = (assignmentId: string) => {
		this.draft.assignments = this.draft.assignments.filter((a) => a.id !== assignmentId);
		this.#touch('supervision.assignments');
	};

	/* ────────────────────────────── AI POLICY ──────────────────────────── */
	addPolicyRule = (overrides: Partial<PolicyRule> = {}): string => {
		const rule = createPolicyRule(overrides);
		this.draft.policyRules.push(rule);
		this.#touch('supervision.policyRules');
		return rule.id;
	};

	setPolicyRuleStatus = (ruleId: string, status: PolicyStatus) => {
		const r = this.draft.policyRules.find((r) => r.id === ruleId);
		if (!r) return;
		r.status = status;
		this.#touch('supervision.policyRules');
	};

	removePolicyRule = (ruleId: string) => {
		this.draft.policyRules = this.draft.policyRules.filter((r) => r.id !== ruleId);
		this.#touch('supervision.policyRules');
	};

	/* ───────────────────────────── TRACEABILITY ────────────────────────── */
	logDecision = (overrides: Partial<Decision> = {}): string | null => {
		if (!(overrides.title ?? '').trim()) return null;
		const d = createDecision(overrides);
		this.draft.decisions.unshift(d);
		this.#touch('supervision.decisions');
		this.notifier.notify('info', `Decision "${d.title}" logged.`);
		return d.id;
	};

	removeDecision = (decisionId: string) => {
		this.draft.decisions = this.draft.decisions.filter((d) => d.id !== decisionId);
		this.#touch('supervision.decisions');
	};

	/* ────────────────────────────── AI GATEWAY ─────────────────────────── */
	/**
	 * Provision (or top-up) a per-member LiteLLM virtual key. `ref` is the member's
	 * stable identity (email/id) — idempotent by ref, so a key follows the person.
	 * Local by default; the deterministic key value is `memberKeyValue(projectId, ref)`.
	 */
	provisionMemberKey = (ref: string, monthlyBudgetUsd = 50) => {
		const id = ref.trim();
		if (!id) return;
		const budget = Math.max(0, Math.round(monthlyBudgetUsd));
		const existing = this.draft.memberKeys.find((k) => k.member === id);
		if (existing) {
			existing.monthlyBudgetUsd = budget;
		} else {
			this.draft.memberKeys.push(createGatewayKey({ member: id, monthlyBudgetUsd: budget }));
		}
		this.#touch('supervision.memberKeys');
		const name = this.roster.find((m) => m.ref === id)?.name ?? id;
		this.notifier.notify('info', `AI key provisioned for ${name}.`);
	};

	setMemberBudget = (member: string, monthlyBudgetUsd: number) => {
		const k = this.draft.memberKeys.find((k) => k.member === member);
		if (!k) return;
		k.monthlyBudgetUsd = Math.max(0, Math.round(monthlyBudgetUsd));
		this.#touch('supervision.memberKeys');
	};

	removeMemberKey = (member: string) => {
		this.draft.memberKeys = this.draft.memberKeys.filter((k) => k.member !== member);
		this.#touch('supervision.memberKeys');
	};

	/**
	 * Provision every member key on the REAL LiteLLM proxy (each with its own
	 * budget cap) and mirror the applied per-member spend back. Server-persisted,
	 * so this bypasses the debounced autosave. Only meaningful when a proxy is
	 * wired (env-gated) — otherwise the keys stay advisory/local.
	 */
	syncMemberKeys = async () => {
		if (!this.session.isAuthenticated) {
			this.notifier.notify('error', 'Sign in to sync member keys.');
			return;
		}
		if (!this.gatewayConfigured) {
			this.notifier.notify('error', 'No LiteLLM proxy configured; keys stay advisory.');
			return;
		}
		// Persist any pending local edits first so the server reads the latest keys.
		await this.flushNow();
		try {
			const res = await fetch('/api/supervision/gateway/push', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					'x-lyriks-client': clientId,
					[REVISION_HEADER]: String(this.#autosave.revision)
				},
				body: JSON.stringify({ projectId: this.draft.projectId })
			});
			if (!res.ok) throw new Error(`sync failed (${res.status})`);
			const { applied, draft, revision } = (await res.json()) as {
				applied: { member: string }[];
				draft: ProjectSupervisionDraft;
				revision: number;
			};
			this.#autosave.adoptSaved(draft, revision);
			this.notifier.notify('info', `Provisioned ${applied.length} member key(s) on the proxy.`);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'sync failed');
		}
	};

	/** Pull each member key's live spend from the proxy back into the ledger. */
	pullMemberSpend = async () => {
		if (!this.gatewayConfigured) {
			this.notifier.notify('error', 'No LiteLLM proxy configured.');
			return;
		}
		try {
			const res = await fetch('/api/supervision/gateway/pull', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					'x-lyriks-client': clientId,
					[REVISION_HEADER]: String(this.#autosave.revision)
				},
				body: JSON.stringify({ projectId: this.draft.projectId })
			});
			if (!res.ok) throw new Error(`pull failed (${res.status})`);
			const { draft, revision } = (await res.json()) as {
				draft: ProjectSupervisionDraft;
				revision: number;
			};
			this.#autosave.adoptSaved(draft, revision);
			this.notifier.notify('info', 'Pulled live member spend from the proxy.');
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'pull failed');
		}
	};
}
