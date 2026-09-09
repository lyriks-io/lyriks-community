import {
	analyzeCoverage,
	buildAcceptanceSpec,
	deriveJourneyFlow,
	simulate,
	type AcceptanceSpec,
	type CoverageGap,
	type RunError
} from '$domain/experience';
import type {
	InvariantCounterexample,
	NamedSurface,
	SpecGap,
	UnspaghettitAdvisorPort
} from '../ports';
import type { LoadExperienceDraftUseCase } from './load-experience-draft';
import type { LoadUsersDraftUseCase } from './load-users-draft';
import type { LoadDataDraftUseCase } from './load-data-draft';
import { experienceFeatureId } from '$application/projection/aux-feature-ids';
import { experienceDraftToBehaviorOps } from '$application/projection/experience-projection';
import type { ProjectExperienceDraft } from '$domain/experience';
import type { ProjectUsersDraft } from '$domain/users';

/** One pass over the wizard projection, read by the engine verdict. */
interface ProjectionFacts {
	/** Ids the projection auto-derives; a spec gap on one is not authoring debt. */
	readonly mirrorIds: ReadonlySet<string>;
	/** Actions the exploration tries from each state it reaches. */
	readonly actions: number;
}

/**
 * Deadlines and work allowance for the engine reads. They exist because the
 * whole report has ONE request budget to fit in, and the engine is the only part
 * of it whose cost grows with the size of the model.
 *
 * Defaults are calibrated on a real 28-surface / 104-action projection, where
 * the engine explored its default 2000 states in 17.7 s and reported the run
 * TRUNCATED at that cap anyway. Bounding the exploration therefore keeps the
 * same class of answer ("no violation found within bounds", and any
 * counterexample it does find is still a real one) while holding the cost near
 * five seconds whatever the model's size.
 */
export interface EngineReadBudgets {
	/** Deadline for one structural read (verify / scenarios / gaps / maturity). */
	readonly readMs: number;
	/** Deadline for the state-space exploration. */
	readonly explorationMs: number;
	/** States x actions the exploration may try before the cap kicks in. */
	readonly explorationWork: number;
}

export const DEFAULT_ENGINE_READ_BUDGETS: EngineReadBudgets = {
	readMs: 12_000,
	explorationMs: 20_000,
	explorationWork: 60_000
};

/** The engine's own default state cap, which we only ever narrow. */
const ENGINE_DEFAULT_MAX_STATES = 2000;
/** Never bound so hard that the exploration stops being worth running. */
const MIN_EXPLORATION_STATES = 120;

/**
 * How many states the exploration may expand on a model with this many actions,
 * or null to leave the engine's own default in place (small models, where the
 * default is already cheap). Cost is states x actions, so holding that product
 * near the budget makes the call take about the same time on any model.
 */
export function explorationCap(actions: number, work: number): number | null {
	if (actions <= 0) return null;
	const cap = Math.round(work / actions);
	if (cap >= ENGINE_DEFAULT_MAX_STATES) return null;
	return Math.max(MIN_EXPLORATION_STATES, cap);
}

/** Per-journey proof: did the derived happy-path actually run end-to-end clean? */
export interface JourneyVerification {
	journeyId: string;
	name: string;
	startScreenId: string | null;
	finalScreenId: string | null;
	/** Screen the simulated run actually ended on. */
	reachedScreenId: string | null;
	actionCount: number;
	/** True when the run reached the journey's final screen with zero errors. */
	ok: boolean;
	reachedFinal: boolean;
	errors: RunError[];
	flowGaps: string[];
}

/**
 * Unspaghettit's authoritative verdict over the projected experience feature —
 * the part of "is this prototype sound?" the deterministic engine owns, now that
 * Step 05's surfaces / transitions / states / scenarios / personas are mirrored
 * into it. `available:false` means the engine was unreachable (the result then
 * falls back to the native builder-runtime checks only).
 */
export interface ExperienceEngineVerdict {
	available: boolean;
	/** The gated `verify` verdict (scenarios + maturity + reachability + drift). */
	passed: boolean;
	/** Maturity % of the experience feature, or null when unavailable. */
	maturity: number | null;
	scenarios: { total: number; passed: number; failed: number };
	/** Static navigation-graph reachability over the projected screens. */
	reachability: {
		unreachableScreens: readonly NamedSurface[];
		terminalScreens: readonly NamedSurface[];
	};
	/** Reachable invariant breaks, each with the shortest action path to them. */
	invariantViolations: readonly InvariantCounterexample[];
	/** Interactions the model checker never observed firing (dead branches). */
	deadInteractions: readonly string[];
	/**
	 * True when the engine answered, but at least one read did not come back
	 * inside its budget. The verdict then stands on the reads that did land, and
	 * `incomplete` names what is missing from it, so a caller never mistakes a
	 * partial pass for a full one.
	 */
	degraded: boolean;
	/** Engine reads that did not answer in budget (empty on a full verdict). */
	incomplete: readonly string[];
	/**
	 * State cap the exploration ran under when it was narrowed below the engine
	 * default for this model's size; null when the engine default applied.
	 */
	explorationCap: number | null;
	specGaps: {
		/** Counts of gaps on AUTHORED entities — mirror-derived noise excluded. */
		critical: number;
		recommended: number;
		/**
		 * Gaps sitting on entities the wizard projection auto-derived (journey
		 * workflow surfaces, screen mirrors, their step actions). The author never
		 * touched these, so their structural emptiness is expected — counted here,
		 * flagged `mirrorDerived` on items, and excluded from the headline counts.
		 */
		mirrorDerived: number;
		/** The detailed gaps, filtered/paged per the request options — authored gaps first. */
		items: Array<SpecGap & { mirrorDerived?: boolean }>;
		/** How many gaps match the severity filter, before limit/offset. */
		totalItems: number;
	};
}

/** Scoping options for the detailed spec-gap list (counts always cover the whole feature). */
export interface VerifyExperienceOptions {
	specGaps?: {
		severity?: 'critical' | 'recommended';
		/** Page size for `items`; defaults to 50 to keep MCP payloads bounded. */
		limit?: number;
		offset?: number;
	};
}

export interface VerifyExperienceResult {
	/** The headline: prototype is verified end-to-end (no blockers, every journey runs clean). */
	ready: boolean;
	readinessScore: number;
	coverage: {
		score: number;
		blocking: number;
		warning: number;
		info: number;
		gaps: CoverageGap[];
	};
	journeys: JourneyVerification[];
	acceptance: AcceptanceSpec;
	/** Unspaghettit's verdict over the projected behavior — the source of truth. */
	engine: ExperienceEngineVerdict;
	/** Why `ready` is false, if so (plain sentences). Empty when ready. */
	blockers: string[];
	/**
	 * Non-gating signals worth acting on (plain sentences) — e.g. unresolved
	 * critical spec gaps. These deliberately do NOT flip `ready`: spec gaps
	 * measure model depth, not whether the prototype runs.
	 */
	advisories: string[];
}

/**
 * The bridge from "prototype" to "build constraint", with Unspaghettit as the
 * source of truth for spec verification.
 *
 * Step 05 already projects every journey/screen/transition/state/scenario/
 * persona into the Unspaghettit workspace, so the deterministic engine — not a
 * parallel Lyriks analyzer — now owns the formal verdict: it runs every
 * scenario, model-checks reachable state for invariant breaks, and reports
 * navigation reachability (unreachable / terminal screens) over the projected
 * graph. The kernel is kept current by the Experience save itself, so we just ask.
 *
 * Two checks stay native because Unspaghettit doesn't carry their inputs:
 *   - the per-journey happy-path run (the Experience Builder runtime threads
 *     fake-backend collections and async calls the projection can't represent);
 *   - the Gherkin acceptance spec (a generated build artifact, not behavior).
 *
 * `ready` now requires BOTH: the engine's gated verdict passes with no reachable
 * invariant violation, AND every journey with steps runs clean. When the engine
 * is unreachable the result degrades to the native checks alone (offline-usable).
 */
export class VerifyExperienceUseCase {
	constructor(
		private readonly loadExperience: LoadExperienceDraftUseCase,
		private readonly loadUsers: LoadUsersDraftUseCase,
		private readonly loadData: LoadDataDraftUseCase,
		private readonly advisor: UnspaghettitAdvisorPort,
		private readonly budgets: EngineReadBudgets = DEFAULT_ENGINE_READ_BUDGETS
	) {}

	async execute(
		projectId: string,
		options: VerifyExperienceOptions = {}
	): Promise<VerifyExperienceResult> {
		const [draft, users, data] = await Promise.all([
			this.loadExperience.execute(projectId),
			this.loadUsers.execute(projectId),
			this.loadData.execute(projectId)
		]);

		const coverage = analyzeCoverage(draft, {
			roles: users.roles.map((r) => ({ id: r.id, name: r.name })),
			entityNames: data.entities.map((e) => e.name)
		});

		const journeys: JourneyVerification[] = draft.journeys
			.slice()
			.sort((a, b) => a.order - b.order)
			.map((j) => {
				const flow = deriveJourneyFlow(draft, j);
				// Drive the derived happy-path headlessly from the journey's first screen.
				const run = simulate(draft.builder, {
					startScreenId: flow.startScreenId,
					actions: flow.script
				});
				const reachedFinal = flow.finalScreenId
					? run.finalScreenId === flow.finalScreenId
					: run.errors.length === 0;
				return {
					journeyId: j.id,
					name: flow.name,
					startScreenId: flow.startScreenId,
					finalScreenId: flow.finalScreenId,
					reachedScreenId: run.finalScreenId,
					actionCount: flow.script.length,
					ok: run.ok && reachedFinal && flow.flowGaps.length === 0,
					reachedFinal,
					errors: run.errors,
					flowGaps: flow.flowGaps
				};
			});

		// Ask Unspaghettit for the authoritative spec verdict over the projected
		// experience feature (the kernel is already current from the last save).
		const engine = await this.engineVerdict(projectId, options, projectionFacts(draft, users));

		const blocking = coverage.gaps.filter((g) => g.severity === 'blocking');
		const failedJourneys = journeys.filter((j) => !j.ok);
		const blockers: string[] = [
			...blocking.map((g) => g.title),
			...failedJourneys.map((j) =>
				j.flowGaps.length
					? `Journey "${j.name}" can't run end-to-end: ${j.flowGaps[0]}`
					: `Journey "${j.name}" raised ${j.errors.length} error(s) when run.`
			),
			...engineBlockers(engine)
		];
		const advisories = engineAdvisories(engine);
		// Only journeys that actually have steps gate readiness. The engine, when
		// reachable, is authoritative: its gated verdict must pass and no reachable
		// invariant may break.
		const journeysOk = journeys.every((j) => j.actionCount === 0 || j.ok);
		const engineOk = !engine.available || (engine.passed && engine.invariantViolations.length === 0);
		const ready = blocking.length === 0 && journeysOk && engineOk;

		return {
			ready,
			readinessScore: coverage.readinessScore,
			coverage: {
				score: coverage.readinessScore,
				blocking: blocking.length,
				warning: coverage.gaps.filter((g) => g.severity === 'warning').length,
				info: coverage.gaps.filter((g) => g.severity === 'info').length,
				gaps: coverage.gaps
			},
			journeys,
			acceptance: buildAcceptanceSpec(draft),
			engine,
			blockers,
			advisories
		};
	}

	/**
	 * Project the current experience into the engine, then fold its scenarios /
	 * model-check / maturity / spec-gaps into one verdict. Every engine call
	 * degrades to null when unreachable, so this returns `available:false` rather
	 * than throwing — the caller falls back to the native checks.
	 */
	private async engineVerdict(
		projectId: string,
		options: VerifyExperienceOptions,
		projection: ProjectionFacts
	): Promise<ExperienceEngineVerdict> {
		const offline: ExperienceEngineVerdict = {
			available: false,
			passed: false,
			maturity: null,
			scenarios: { total: 0, passed: 0, failed: 0 },
			reachability: { unreachableScreens: [], terminalScreens: [] },
			invariantViolations: [],
			deadInteractions: [],
			degraded: false,
			incomplete: [],
			explorationCap: null,
			specGaps: { critical: 0, recommended: 0, mirrorDerived: 0, items: [], totalItems: 0 }
		};
		if (!this.advisor.available) return offline;

		// The Experience section now projects its behavior graph into the kernel on
		// every save (Phase 4), so the `<pid>__experience` feature the engine reads is
		// already current — no separate freshen step is needed here.
		const exId = experienceFeatureId(projectId);
		// The four structural reads first, the state-space exploration after. They
		// cost milliseconds, they are what proves the engine can see this feature at
		// all, and one stdio connection serializes every call anyway: sending the
		// expensive one alongside them only starved them of the shared budget.
		const [verdict, scenarios, specGaps, score] = await Promise.all([
			this.advisor.verify(exId, { timeoutMs: this.budgets.readMs }),
			this.advisor.runScenarios(exId, undefined, { timeoutMs: this.budgets.readMs }),
			this.advisor.getSpecGaps(exId, { timeoutMs: this.budgets.readMs }),
			this.advisor.scoreFeature(exId, { timeoutMs: this.budgets.readMs })
		]);

		// Every read came back null → the engine couldn't see this feature at all.
		if (!verdict && !scenarios && !score) return offline;

		const cap = explorationCap(projection.actions, this.budgets.explorationWork);
		const modelCheck = await this.advisor.modelCheck(exId, {
			...(cap === null ? {} : { maxStates: cap }),
			timeoutMs: this.budgets.explorationMs
		});

		const incomplete = [
			...(verdict ? [] : ['verify']),
			...(scenarios ? [] : ['scenarios']),
			...(score ? [] : ['maturity']),
			...(modelCheck ? [] : ['model check'])
		];

		return {
			available: true,
			passed: verdict?.passed ?? false,
			maturity: score ? score.percentage : null,
			scenarios: {
				total: scenarios?.total ?? 0,
				passed: scenarios?.passed ?? 0,
				failed: scenarios?.failed ?? 0
			},
			reachability: reconcileReachability(
				modelCheck?.unreachableSurfaces ?? [],
				modelCheck?.terminalSurfaces ?? []
			),
			invariantViolations: modelCheck?.invariantViolations ?? [],
			deadInteractions: modelCheck?.deadActions ?? [],
			degraded: incomplete.length > 0,
			incomplete,
			explorationCap: cap,
			specGaps: rollupSpecGaps(specGaps, projection.mirrorIds, options.specGaps)
		};
	}
}

/**
 * What the pure wizard projection tells us about the `__experience` feature the
 * engine reads, gathered in ONE pass because both facts come from the same walk:
 *
 *  - `mirrorIds`: every entity the projection auto-derives (the feature itself,
 *    journey workflow surfaces, screen mirror surfaces, their step/write
 *    actions). Exact rather than prefix-guessed, so a spec gap on one of them is
 *    read as expected structural emptiness, not authoring debt.
 *  - `actions`: how many actions the exploration will have to try from every
 *    state it reaches, which is the term that decides what that costs.
 */
function projectionFacts(draft: ProjectExperienceDraft, users: ProjectUsersDraft): ProjectionFacts {
	const mirrorIds = new Set<string>([experienceFeatureId(draft.projectId)]);
	let actions = 0;
	try {
		for (const op of experienceDraftToBehaviorOps(draft, { features: null, users })) {
			if (op.kind !== 'upsertExperienceFeature') continue;
			const surfaces = (op as { surfaces?: Array<Record<string, unknown>> }).surfaces ?? [];
			for (const s of surfaces) {
				if (typeof s.id === 'string') mirrorIds.add(s.id);
				const surfaceActions = Array.isArray(s.actions)
					? (s.actions as Array<Record<string, unknown>>)
					: [];
				actions += surfaceActions.length;
				for (const a of surfaceActions) if (typeof a.id === 'string') mirrorIds.add(a.id);
			}
		}
	} catch {
		// The demotion is best-effort: an unprojectable draft just skips it.
	}
	return { mirrorIds, actions };
}

/**
 * Keep the two reachability lists disjoint. A surface the model-check reports as
 * unreachable can't also be meaningfully "terminal" (a terminal is an END of a
 * reached path) — engines that model each journey as an isolated surface used to
 * emit both, so the same screen appeared under `unreachableScreens` AND
 * `terminalScreens`, contradicting itself. Unreachable wins; terminal drops it.
 */
export function reconcileReachability(
	unreachable: readonly NamedSurface[],
	terminal: readonly NamedSurface[]
): ExperienceEngineVerdict['reachability'] {
	const unreachableIds = new Set(unreachable.map((s) => s.surfaceId));
	return {
		unreachableScreens: unreachable,
		terminalScreens: terminal.filter((s) => !unreachableIds.has(s.surfaceId))
	};
}

/**
 * Counts cover every AUTHORED gap; gaps sitting on mirror-derived entities are
 * demoted — flagged on their item, tallied separately, and sorted after the
 * authored ones — so a wizard-only project doesn't read as "49 critical gaps"
 * over surfaces the author never touched. The detailed list stays severity-
 * filtered and paged (default page 50) so verify stays usable on a large model.
 */
function rollupSpecGaps(
	gaps: SpecGap[],
	mirrorIds: ReadonlySet<string>,
	opts: VerifyExperienceOptions['specGaps'] = {}
): ExperienceEngineVerdict['specGaps'] {
	const annotated: Array<SpecGap & { mirrorDerived?: boolean }> = gaps.map((g) =>
		g.entityId && mirrorIds.has(g.entityId) ? { ...g, mirrorDerived: true } : g
	);
	const authored = annotated.filter((g) => !g.mirrorDerived);
	const matching = (opts.severity ? annotated.filter((g) => g.severity === opts.severity) : annotated)
		// Authored gaps first: page 1 shows real authoring debt, not mirror noise.
		.sort((a, b) => Number(a.mirrorDerived ?? false) - Number(b.mirrorDerived ?? false));
	const offset = Math.max(0, opts.offset ?? 0);
	const limit = Math.max(0, opts.limit ?? 50);
	return {
		critical: authored.filter((g) => g.severity === 'critical').length,
		recommended: authored.filter((g) => g.severity === 'recommended').length,
		mirrorDerived: annotated.length - authored.length,
		items: matching.slice(offset, offset + limit),
		totalItems: matching.length
	};
}

/**
 * Plain-sentence blockers derived from the engine verdict (empty when offline).
 * Only conditions that actually gate `ready` belong here — spec gaps don't, so
 * they are reported as advisories instead.
 */
function engineBlockers(engine: ExperienceEngineVerdict): string[] {
	if (!engine.available) return [];
	const out: string[] = [];
	if (engine.scenarios.failed > 0) {
		out.push(
			`${engine.scenarios.failed} of ${engine.scenarios.total} scenario${engine.scenarios.total === 1 ? '' : 's'} fail in the simulator.`
		);
	}
	for (const v of engine.invariantViolations) {
		const path = v.path.length ? ` (via ${v.path.join(' → ')})` : '';
		out.push(`Invariant "${v.invariantName}" can break${path}.`);
	}
	return out;
}

/** Non-gating engine signals: worth fixing, but they never flip `ready`. */
function engineAdvisories(engine: ExperienceEngineVerdict): string[] {
	if (!engine.available) return [];
	const out: string[] = [];
	// Say it out loud when the verdict stands on fewer readings than usual. A
	// missing reading can only make the verdict MORE permissive (nothing it would
	// have reported can block), so silence here would read as a clean pass.
	if (engine.degraded) {
		out.push(
			`The engine did not finish ${engine.incomplete.join(', ')} within its budget on a model this size, so that reading is not part of this verdict.`
		);
	}
	if (engine.specGaps.critical > 0) {
		out.push(
			`${engine.specGaps.critical} critical spec gap${engine.specGaps.critical === 1 ? '' : 's'} unresolved (behavioral depth, does not block readiness; see engine.specGaps.items).`
		);
	}
	return out;
}
