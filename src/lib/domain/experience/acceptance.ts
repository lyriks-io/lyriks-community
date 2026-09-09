/**
 * Step 05 — turn a VERIFIED prototype into the contract the build must satisfy.
 *
 * The simulator proves a flow behaves; this module captures that proof as a
 * portable artifact: for each journey it derives the happy-path click sequence
 * (walking the navigation graph between consecutive step screens), and it lifts
 * every authored Given/When/Then element scenario into a structured acceptance
 * criterion — emitted both as data and as Gherkin. Paired with a headless
 * `simulate` of each derived path (see VerifyExperienceUseCase), this is what
 * carries "it works in the prototype" forward into "the build must do this".
 *
 * Pure functions only — no store, no IO.
 */
import type { ProjectExperienceDraft, Journey } from './draft';
import { stepsOfJourney, screenPath } from './draft';
import type { AssertOp, BuilderElementNode, ScenarioAssertion } from './builder';
import { hostedSurfacesResolver } from './surface-hosting';
import { blocksWhenEmpty, inputNodesOfScreen, sampleInputValue } from './builder-runtime';
import type { SimAction } from './simulate';

/** One assertion, both human text and the structured state condition behind it. */
export interface AcceptanceAssertion {
	text: string;
	path: string;
	op: AssertOp;
	expected?: string;
}

/** A single authored Given/When/Then, flattened for the spec. */
export interface AcceptanceCriterion {
	id: string;
	title: string;
	/** Screen the asserting element lives on (name + id). */
	screen: string;
	screenId: string;
	whenTrigger: string;
	given: AcceptanceAssertion[];
	then: AcceptanceAssertion[];
}

/** One navigation in the happy-path: which element advances to which screen. */
export interface JourneyHop {
	viaLabel: string;
	viaKind: string;
	toScreen: string;
	toScreenId: string;
	toPath: string;
}

export interface JourneyFlow {
	journeyId: string;
	name: string;
	/** Ordered (stepName, screenId, screenName) for steps that link a screen. */
	stops: { step: string; screenId: string; screen: string }[];
	/** Derived happy-path actions to drive the journey end-to-end (best-effort). */
	script: SimAction[];
	startScreenId: string | null;
	/** URL route of the first stop (entry of this journey), for E2E `goto`. */
	entryPath: string | null;
	/** Resolved navigations (element → next screen) for generating E2E steps. */
	hops: JourneyHop[];
	/** The screen the journey should END on (last linked step), for assertion. */
	finalScreenId: string | null;
	/** Places the path can't auto-advance (no navigation between two stops). */
	flowGaps: string[];
	criteria: AcceptanceCriterion[];
}

export interface AcceptanceSpec {
	features: JourneyFlow[];
	criteriaCount: number;
	gherkin: string;
}

const screenNameOf = (draft: ProjectExperienceDraft, id: string | null): string =>
	id
		? (draft.screens.find((s) => s.id === id)?.name?.trim() ||
			draft.components.find((c) => c.id === id)?.name?.trim() ||
			'screen')
		: '(none)';

/**
 * Element nodes that render on `screenId` — its own plus those contributed by
 * hosted reusable components (a sidebar's links count as the screen's).
 */
function elementsOfScreen(draft: ProjectExperienceDraft, screenId: string): BuilderElementNode[] {
	const surfaces = hostedSurfacesResolver(draft.builder.nodes)(screenId);
	return Object.values(draft.builder.nodes).filter(
		(n): n is BuilderElementNode => n.kind === 'element' && surfaces.has(n.surfaceId)
	);
}

/** An element on `fromScreen` whose click navigates to `toScreen` (transition or surface binding). */
function navElementTo(
	draft: ProjectExperienceDraft,
	fromScreen: string,
	toScreen: string
): BuilderElementNode | null {
	for (const el of elementsOfScreen(draft, fromScreen)) {
		const byTransition = el.wiring.transitions.some(
			(t) => t.effect.kind === 'navigate' && t.effect.target === toScreen
		);
		const byBinding =
			el.wiring.binding?.targetKind === 'surface' && el.wiring.binding.targetRef === toScreen;
		if (byTransition || byBinding) return el;
	}
	return null;
}

/**
 * Best-effort happy-path for a journey: start on its first linked screen, then
 * for each consecutive pair of step-screens find the element that navigates
 * between them and click it. Records a flow gap wherever no such navigation
 * exists (the prototype can't actually get from one step to the next yet).
 */
export function deriveJourneyFlow(draft: ProjectExperienceDraft, journey: Journey): JourneyFlow {
	const hasRoot = (id: string) => Boolean(draft.builder.screenRoots[id]);
	const steps = stepsOfJourney(draft, journey.id);
	const stops = steps
		.filter((s) => s.linkedScreenId && hasRoot(s.linkedScreenId))
		.map((s) => ({
			step: s.name?.trim() || 'Step',
			screenId: s.linkedScreenId as string,
			screen: screenNameOf(draft, s.linkedScreenId)
		}));

	const pathOf = (screenId: string): string => {
		const s = draft.screens.find((x) => x.id === screenId);
		return s ? screenPath(s) : '/';
	};
	const script: SimAction[] = [];
	const flowGaps: string[] = [];
	const hops: JourneyHop[] = [];
	for (let i = 0; i < stops.length - 1; i++) {
		const from = stops[i];
		const to = stops[i + 1];
		if (from.screenId === to.screenId) continue; // same screen, no nav needed
		const el = navElementTo(draft, from.screenId, to.screenId);
		if (el) {
			// A require-valid submit is blocked while its screen holds an invalid
			// input, so the happy path has to fill the form before pressing it. That
			// is what a user does, and skipping it made every screen behind a login
			// or a submit look unreachable.
			if (el.wiring.requireValid) {
				for (const input of inputNodesOfScreen(draft.builder, from.screenId)) {
					if (!blocksWhenEmpty(input)) continue;
					const value = sampleInputValue(input);
					// A field whose own rules we cannot satisfy is left empty on purpose:
					// the run then fails on it and names it, which is a real finding.
					if (value !== null) script.push({ nodeId: input.id, type: value });
				}
			}
			script.push({ nodeId: el.id, trigger: 'click' });
			hops.push({
				viaLabel: el.label || 'element',
				viaKind: el.elementKind,
				toScreen: to.screen,
				toScreenId: to.screenId,
				toPath: pathOf(to.screenId)
			});
		} else flowGaps.push(`No navigation from "${from.screen}" to "${to.screen}".`);
	}

	// Acceptance criteria: every element scenario on this journey's screens.
	const criteria: AcceptanceCriterion[] = [];
	const seenScreens = new Set(stops.map((s) => s.screenId));
	const fmt = (a: ScenarioAssertion): string => {
		const subject = a.path || 'state';
		if (a.op === 'truthy') return `${subject} is set`;
		if (a.op === 'falsy') return `${subject} is not set`;
		if (a.op === 'eq') return `${subject} equals "${a.expected ?? ''}"`;
		return `${subject} does not equal "${a.expected ?? ''}"`;
	};
	const toAssertion = (a: ScenarioAssertion): AcceptanceAssertion => ({
		text: fmt(a),
		path: a.path,
		op: a.op,
		expected: a.expected
	});
	// A reusable component hosted by several of this journey's screens contributes
	// each scenario once (first hosting screen), not once per host.
	const seenCriteria = new Set<string>();
	for (const screenId of seenScreens)
		for (const el of elementsOfScreen(draft, screenId))
			for (const sc of el.wiring.scenarios) {
				if (seenCriteria.has(`${el.id}-${sc.id}`)) continue;
				seenCriteria.add(`${el.id}-${sc.id}`);
				criteria.push({
					id: `${el.id}-${sc.id}`,
					title: sc.title || `${el.label || 'Element'} behaves`,
					screen: screenNameOf(draft, screenId),
					screenId,
					whenTrigger: sc.whenTrigger,
					given: sc.given.map(toAssertion),
					then: sc.then.map(toAssertion)
				});
			}

	return {
		journeyId: journey.id,
		name: journey.name?.trim() || 'Journey',
		stops,
		script,
		startScreenId: stops[0]?.screenId ?? draft.builder.entryScreenId ?? null,
		entryPath: stops[0] ? pathOf(stops[0].screenId) : null,
		hops,
		finalScreenId: stops[stops.length - 1]?.screenId ?? null,
		flowGaps,
		criteria
	};
}

/** Render the full spec as Gherkin so it reads as acceptance criteria a build must meet. */
function toGherkin(features: JourneyFlow[]): string {
	const lines: string[] = [];
	for (const f of features) {
		lines.push(`Feature: ${f.name}`);
		if (f.stops.length) {
			lines.push(`  Scenario: complete the "${f.name}" journey`);
			lines.push(`    Given the user starts on "${f.stops[0].screen}"`);
			for (let i = 1; i < f.stops.length; i++)
				lines.push(`    When the user proceeds to "${f.stops[i].screen}"`);
			if (f.finalScreenId)
				lines.push(`    Then the user lands on "${screenLabel(f)}"`);
			for (const g of f.flowGaps) lines.push(`    # GAP: ${g}`);
		}
		for (const c of f.criteria) {
			lines.push(`  Scenario: ${c.title} (on "${c.screen}")`);
			for (const g of c.given) lines.push(`    Given ${g.text}`);
			lines.push(`    When the user performs ${c.whenTrigger}`);
			for (const t of c.then) lines.push(`    Then ${t.text}`);
		}
		lines.push('');
	}
	return lines.join('\n').trim();
}

const screenLabel = (f: JourneyFlow): string => f.stops[f.stops.length - 1]?.screen ?? 'the final screen';

export function buildAcceptanceSpec(draft: ProjectExperienceDraft): AcceptanceSpec {
	const features = draft.journeys
		.slice()
		.sort((a, b) => a.order - b.order)
		.map((j) => deriveJourneyFlow(draft, j))
		.filter((f) => f.stops.length > 0 || f.criteria.length > 0);
	const criteriaCount = features.reduce((n, f) => n + f.criteria.length, 0);
	return { features, criteriaCount, gherkin: toGherkin(features) };
}
