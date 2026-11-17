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
import { simulate } from './simulate';
import { planNavigation } from './plan-navigation';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

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
	/**
	 * How many of `script` come from the steps' own authored `actions`, as opposed
	 * to the navigation this derivation had to plan. Zero means the run proves
	 * nothing about what happens ON the screens: it only walked between them.
	 */
	authoredActionCount: number;
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

/** The texts this module writes, in the language of the spec; model names are quoted, never translated. */
const TEXTS = {
	en: {
		screen: 'screen',
		none: '(none)',
		step: 'Step',
		journey: 'Journey',
		element: 'Element',
		behaves: (label: string) => `${label} behaves`,
		state: 'state',
		finalScreen: 'the final screen',
		actionsNotArray: (step: string) => `Step "${step}" actions must be an array.`,
		noExecutablePath: (from: string, to: string) =>
			`No executable path from "${from}" to "${to}" within the planning budget. Check visibility/validation guards or author steps[].actions explicitly.`,
		noNavigation: (from: string, to: string) => `No navigation from "${from}" to "${to}".`,
		isSet: (subject: string) => `${subject} is set`,
		isNotSet: (subject: string) => `${subject} is not set`,
		equals: (subject: string, value: string) => `${subject} equals "${value}"`,
		notEquals: (subject: string, value: string) => `${subject} does not equal "${value}"`
	},
	fr: {
		screen: 'écran',
		none: '(aucun)',
		step: 'Étape',
		journey: 'Parcours',
		element: 'Élément',
		behaves: (label: string) => `${label} se comporte comme prévu`,
		state: "l'état",
		finalScreen: "l'écran final",
		actionsNotArray: (step: string) =>
			`Les actions (steps[].actions) de l'étape ${quoteName('fr', step)} doivent être une liste.`,
		noExecutablePath: (from: string, to: string) =>
			`Aucun chemin exécutable de ${quoteName('fr', from)} à ${quoteName('fr', to)} dans le budget de planification. Vérifiez les conditions de visibilité et de validation, ou écrivez steps[].actions explicitement.`,
		noNavigation: (from: string, to: string) =>
			`Aucune navigation de ${quoteName('fr', from)} vers ${quoteName('fr', to)}.`,
		isSet: (subject: string) => `${subject} a une valeur`,
		isNotSet: (subject: string) => `${subject} n'a pas de valeur`,
		equals: (subject: string, value: string) => `${subject} vaut ${quoteName('fr', value)}`,
		notEquals: (subject: string, value: string) => `${subject} ne vaut pas ${quoteName('fr', value)}`
	}
} as const;

const screenNameOf = (draft: ProjectExperienceDraft, id: string | null, lang: SpecLanguage = 'en'): string =>
	id
		? (draft.screens.find((s) => s.id === id)?.name?.trim() ||
			draft.components.find((c) => c.id === id)?.name?.trim() ||
			TEXTS[lang].screen)
		: TEXTS[lang].none;

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
export function deriveJourneyFlow(
	draft: ProjectExperienceDraft,
	journey: Journey,
	lang: SpecLanguage = 'en'
): JourneyFlow {
	const t = TEXTS[lang];
	const hasRoot = (id: string) => Boolean(draft.builder.screenRoots[id]);
	const steps = stepsOfJourney(draft, journey.id);
	const stops = steps
		.filter((s) => s.linkedScreenId && hasRoot(s.linkedScreenId))
		.map((s) => ({
			stepId: s.id,
			step: s.name?.trim() || t.step,
			screenId: s.linkedScreenId as string,
			screen: screenNameOf(draft, s.linkedScreenId, lang)
		}));

	const pathOf = (screenId: string): string => {
		const s = draft.screens.find((x) => x.id === screenId);
		return s ? screenPath(s) : '/';
	};
	const script: SimAction[] = [];
	let authoredActionCount = 0;
	const flowGaps: string[] = [];
	const hops: JourneyHop[] = [];
	const start = stops[0]?.screenId ?? draft.builder.entryScreenId;
	for (let i = 0; i < stops.length; i++) {
		const from = stops[i];
		const actions = steps.find((s) => s.id === from.stepId)?.actions;
		if (Array.isArray(actions)) {
			script.push(...actions);
			authoredActionCount += actions.length;
		} else if (actions !== undefined)
			flowGaps.push(t.actionsNotArray(from.step));
		const to = stops[i + 1];
		if (!to) continue;
		if (from.screenId === to.screenId) continue; // same screen, no nav needed
		if (actions?.length && simulate(draft.builder, { startScreenId: start, actions: script }).finalScreenId === to.screenId) continue;
		const planned = start ? planNavigation(draft.builder, start, script, from.screenId, to.screenId) : null;
		if (planned) {
			script.push(...planned);
			const navigation = draft.builder.nodes[planned[planned.length - 1].nodeId ?? ''];
			if (navigation?.kind === 'element') hops.push({
				viaLabel: navigation.label || 'element', viaKind: navigation.elementKind,
				toScreen: to.screen, toScreenId: to.screenId, toPath: pathOf(to.screenId)
			});
			continue;
		}
		const el = navElementTo(draft, from.screenId, to.screenId);
		if (el) {
			flowGaps.push(t.noExecutablePath(from.screen, to.screen));
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
		} else flowGaps.push(t.noNavigation(from.screen, to.screen));
	}

	// Acceptance criteria: every element scenario on this journey's screens.
	const criteria: AcceptanceCriterion[] = [];
	const seenScreens = new Set(stops.map((s) => s.screenId));
	const fmt = (a: ScenarioAssertion): string => {
		const subject = a.path ? (lang === 'fr' ? quoteName(lang, a.path) : a.path) : t.state;
		if (a.op === 'truthy') return t.isSet(subject);
		if (a.op === 'falsy') return t.isNotSet(subject);
		if (a.op === 'eq') return t.equals(subject, a.expected ?? '');
		return t.notEquals(subject, a.expected ?? '');
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
					title: sc.title || t.behaves(el.label || t.element),
					screen: screenNameOf(draft, screenId, lang),
					screenId,
					whenTrigger: sc.whenTrigger,
					given: sc.given.map(toAssertion),
					then: sc.then.map(toAssertion)
				});
			}

	return {
		journeyId: journey.id,
		name: journey.name?.trim() || t.journey,
		stops,
		script,
		authoredActionCount,
		startScreenId: stops[0]?.screenId ?? draft.builder.entryScreenId ?? null,
		entryPath: stops[0] ? pathOf(stops[0].screenId) : null,
		hops,
		finalScreenId: stops[stops.length - 1]?.screenId ?? null,
		flowGaps,
		criteria
	};
}

/**
 * The Gherkin skeleton in each language. French uses the French keywords a
 * Gherkin parser reads under `# language: fr`; a keyword's colon stays glued
 * to it (`Fonctionnalité:`), since the parser requires it, while the prose
 * follows French typography.
 */
const GHERKIN = {
	en: {
		header: null,
		feature: 'Feature',
		scenario: 'Scenario',
		given: 'Given',
		when: 'When',
		then: 'Then',
		and: null,
		journeyTitle: (name: string) => `complete the "${name}" journey`,
		startsOn: (screen: string) => `the user starts on "${screen}"`,
		proceedsTo: (screen: string) => `the user proceeds to "${screen}"`,
		landsOn: (screen: string) => `the user lands on "${screen}"`,
		gap: (gap: string) => `# GAP: ${gap}`,
		onScreen: (title: string, screen: string) => `${title} (on "${screen}")`,
		performs: (trigger: string) => `the user performs ${trigger}`
	},
	fr: {
		header: '# language: fr',
		feature: 'Fonctionnalité',
		scenario: 'Scénario',
		given: 'Étant donné',
		when: 'Quand',
		then: 'Alors',
		and: 'Et',
		journeyTitle: (name: string) => `réaliser le parcours ${quoteName('fr', name)}`,
		startsOn: (screen: string) => `que l'utilisateur démarre sur ${quoteName('fr', screen)}`,
		proceedsTo: (screen: string) => `l'utilisateur passe à ${quoteName('fr', screen)}`,
		landsOn: (screen: string) => `l'utilisateur arrive sur ${quoteName('fr', screen)}`,
		gap: (gap: string) => `# LACUNE${NBSP}: ${gap}`,
		onScreen: (title: string, screen: string) => `${title} (sur ${quoteName('fr', screen)})`,
		performs: (trigger: string) => `l'utilisateur déclenche ${quoteName('fr', trigger)}`
	}
} as const;

/** Render the full spec as Gherkin so it reads as acceptance criteria a build must meet. */
function toGherkin(features: JourneyFlow[], lang: SpecLanguage = 'en'): string {
	const g = GHERKIN[lang];
	const lines: string[] = [];
	if (g.header) lines.push(g.header, '');
	// English repeats the keyword on every line, as it always did; French
	// continues a clause with "Et", as French Gherkin reads.
	const keyword = (base: string, index: number): string => (index > 0 && g.and ? g.and : base);
	for (const f of features) {
		lines.push(`${g.feature}: ${f.name}`);
		if (f.stops.length) {
			lines.push(`  ${g.scenario}: ${g.journeyTitle(f.name)}`);
			lines.push(`    ${g.given} ${g.startsOn(f.stops[0].screen)}`);
			for (let i = 1; i < f.stops.length; i++)
				lines.push(`    ${keyword(g.when, i - 1)} ${g.proceedsTo(f.stops[i].screen)}`);
			if (f.finalScreenId)
				lines.push(`    ${g.then} ${g.landsOn(screenLabel(f, lang))}`);
			for (const gap of f.flowGaps) lines.push(`    ${g.gap(gap)}`);
		}
		for (const c of f.criteria) {
			lines.push(`  ${g.scenario}: ${g.onScreen(c.title, c.screen)}`);
			c.given.forEach((a, i) => lines.push(`    ${keyword(g.given, i)} ${a.text}`));
			lines.push(`    ${g.when} ${g.performs(c.whenTrigger)}`);
			c.then.forEach((a, i) => lines.push(`    ${keyword(g.then, i)} ${a.text}`));
		}
		lines.push('');
	}
	return lines.join('\n').trim();
}

const screenLabel = (f: JourneyFlow, lang: SpecLanguage = 'en'): string =>
	f.stops[f.stops.length - 1]?.screen ?? TEXTS[lang].finalScreen;

export function buildAcceptanceSpec(draft: ProjectExperienceDraft, lang: SpecLanguage = 'en'): AcceptanceSpec {
	const features = draft.journeys
		.slice()
		.sort((a, b) => a.order - b.order)
		.map((j) => deriveJourneyFlow(draft, j, lang))
		.filter((f) => f.stops.length > 0 || f.criteria.length > 0);
	const criteriaCount = features.reduce((n, f) => n + f.criteria.length, 0);
	return { features, criteriaCount, gherkin: toGherkin(features, lang) };
}
