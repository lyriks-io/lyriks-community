/**
 * Plan-coverage analysis, read from the journeys and the screen inventory. The
 * experience is described, not drawn: this answers "does every journey say what
 * the persona goes through, on which screen, doing what with which data?". No
 * reading here looks at a drawn layout, so a project without one is never
 * lowered or blocked for it, and no finding is blocking. Pure functions only.
 *
 * Shape mirrors the coherence report (dimensions + gaps + readinessScore) so the
 * UI reads familiarly.
 */
import type { ProjectExperienceDraft } from './draft';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

export type CoverageSeverity = 'blocking' | 'warning' | 'info';

/** Where a gap lives, so the UI can jump-and-select it in the editor. */
export interface CoverageRef {
	screenId?: string;
	nodeId?: string;
}

export interface CoverageGap {
	id: string;
	severity: CoverageSeverity;
	title: string;
	detail: string;
	/** Present when the gap points at a concrete screen or step (jump target). */
	ref?: CoverageRef;
}

export interface CoverageDimension {
	key: string;
	label: string;
	/** Items satisfied / total considered. `total === 0` means not applicable yet. */
	covered: number;
	total: number;
	gaps: CoverageGap[];
}

export interface CoverageReport {
	dimensions: CoverageDimension[];
	/** All gaps, flattened and sorted blocking, warning, info. */
	gaps: CoverageGap[];
	/** 0-100. Mean of applicable dimension ratios, capped while any blocker stands. */
	readinessScore: number;
}

export interface CoverageContext {
	roles: { id: string; name: string }[];
	/** Entity names from the data model (for "is every entity read by a step?"). */
	entityNames: string[];
}

const SEVERITY_RANK: Record<CoverageSeverity, number> = { blocking: 0, warning: 1, info: 2 };
const norm = (s: string) => s.trim().toLowerCase();

/** The texts of the coverage report, in the language of the spec; model names are quoted as they are. */
const TEXTS = {
	en: {
		untitledScreen: 'Untitled screen',
		untitledStep: 'Untitled step',
		unvisited: (screen: string) => `"${screen}" is visited by no step`,
		unvisitedDetail:
			'Link a journey step to this screen, or remove it from the inventory if the product no longer shows it.',
		screensLabel: 'Screens visited',
		journey: 'Journey',
		noScreen: (journey: string) => `"${journey}" has no screen`,
		noSteps: 'This journey has no steps. Add steps and link each to a screen.',
		noLinkedStep: 'None of this journey’s steps link to a screen yet.',
		journeysLabel: 'Journeys on screens',
		stepUnlinked: (step: string) => `"${step}" lands on no screen`,
		stepUnlinkedDetail: 'Say on which screen of the inventory this step happens.',
		stepsLabel: 'Steps on a screen',
		stepShallow: (step: string) => `"${step}" says nothing it does`,
		stepShallowDetail: 'Name what the step does under the hood (an operation) or which data it reads or writes.',
		depthLabel: 'Steps described',
		core: 'Core',
		coreNoScreen: (core: string) => `Capability area "${core}" has no journey on a screen`,
		coreNoScreenDetail: 'No journey under this capability area links to a screen yet.',
		coresLabel: 'Capability areas walked',
		role: 'role',
		roleNoPresence: (role: string) => `Role "${role}" performs no journey`,
		roleNoPresenceDetail: 'Name this role as the actor of the journeys it goes through; its experience is undefined.',
		rolesLabel: 'Roles covered',
		entityUnused: (entity: string) => `Entity "${entity}" is read by no step`,
		entityUnusedDetail: 'Say which journey step reads or writes this data, so the experience exercises it.',
		entitiesLabel: 'Data used'
	},
	fr: {
		untitledScreen: 'Écran sans titre',
		untitledStep: 'Étape sans titre',
		unvisited: (screen: string) => `${quoteName('fr', screen)} n'est visité par aucune étape`,
		unvisitedDetail:
			"Reliez une étape de parcours à cet écran, ou retirez-le de l'inventaire si le produit ne le montre plus.",
		screensLabel: 'Écrans visités',
		journey: 'Parcours',
		noScreen: (journey: string) => `${quoteName('fr', journey)} n'a aucun écran`,
		noSteps: "Ce parcours n'a aucune étape. Ajoutez des étapes et reliez chacune à un écran.",
		noLinkedStep: "Aucune étape de ce parcours n'est encore reliée à un écran.",
		journeysLabel: 'Parcours sur des écrans',
		stepUnlinked: (step: string) => `${quoteName('fr', step)} n'arrive sur aucun écran`,
		stepUnlinkedDetail: "Dites sur quel écran de l'inventaire cette étape se déroule.",
		stepsLabel: 'Étapes sur un écran',
		stepShallow: (step: string) => `${quoteName('fr', step)} ne dit rien de ce qu'elle fait`,
		stepShallowDetail: "Nommez ce que l'étape fait en coulisse (une opération) ou les données qu'elle lit ou écrit.",
		depthLabel: 'Étapes décrites',
		core: 'Domaine',
		coreNoScreen: (core: string) => `Le domaine fonctionnel ${quoteName('fr', core)} n'a aucun parcours sur un écran`,
		coreNoScreenDetail: "Aucun parcours de ce domaine fonctionnel n'est encore relié à un écran.",
		coresLabel: 'Domaines fonctionnels parcourus',
		role: 'rôle',
		roleNoPresence: (role: string) => `Le rôle ${quoteName('fr', role)} n'effectue aucun parcours`,
		roleNoPresenceDetail: `Nommez ce rôle comme acteur des parcours qu'il emprunte${NBSP}; son expérience n'est pas définie.`,
		rolesLabel: 'Rôles couverts',
		entityUnused: (entity: string) => `L'entité ${quoteName('fr', entity)} n'est lue par aucune étape`,
		entityUnusedDetail: "Dites quelle étape de parcours lit ou écrit ces données, pour que l'expérience les exerce.",
		entitiesLabel: 'Données utilisées'
	}
} as const;

export function analyzeCoverage(
	draft: ProjectExperienceDraft,
	ctx: CoverageContext,
	lang: SpecLanguage = 'en'
): CoverageReport {
	const t = TEXTS[lang];
	const dimensions: CoverageDimension[] = [];
	const { screens, journeys, steps, derivedCores } = draft;
	const screenById = new Map(screens.map((s) => [s.id, s]));
	const onScreen = (screenId: string | null | undefined): boolean => Boolean(screenId && screenById.has(screenId));

	/* 1. Screens visited: every screen of the inventory is some step's stop. */
	{
		const gaps: CoverageGap[] = [];
		const visited = new Set(steps.map((s) => s.linkedScreenId).filter((id): id is string => Boolean(id)));
		let covered = 0;
		for (const s of screens) {
			if (visited.has(s.id)) covered++;
			else
				gaps.push({
					id: `screen-unvisited-${s.id}`,
					severity: 'warning',
					title: t.unvisited(s.name || t.untitledScreen),
					detail: t.unvisitedDetail,
					ref: { screenId: s.id }
				});
		}
		dimensions.push({ key: 'screens', label: t.screensLabel, covered, total: screens.length, gaps });
	}

	/* 2. Journeys land on a screen. */
	{
		const gaps: CoverageGap[] = [];
		let covered = 0;
		for (const j of journeys) {
			const js = steps.filter((s) => s.journeyId === j.id);
			const linked = js.filter((s) => onScreen(s.linkedScreenId));
			if (js.length > 0 && linked.length > 0) covered++;
			else
				gaps.push({
					id: `journey-unlinked-${j.id}`,
					severity: 'warning',
					title: t.noScreen(j.name || t.journey),
					detail: js.length === 0 ? t.noSteps : t.noLinkedStep
				});
		}
		dimensions.push({ key: 'journeys', label: t.journeysLabel, covered, total: journeys.length, gaps });
	}

	/* 3. Every step happens on a screen of the inventory. */
	{
		const gaps: CoverageGap[] = [];
		let covered = 0;
		for (const s of steps) {
			if (onScreen(s.linkedScreenId)) covered++;
			else
				gaps.push({
					id: `step-unlinked-${s.id}`,
					severity: 'warning',
					title: t.stepUnlinked(s.name || t.untitledStep),
					detail: t.stepUnlinkedDetail,
					ref: { nodeId: s.id }
				});
		}
		dimensions.push({ key: 'steps', label: t.stepsLabel, covered, total: steps.length, gaps });
	}

	/* 4. Every step says what it does: an operation or a data read. */
	{
		const gaps: CoverageGap[] = [];
		const described = new Set([
			...draft.stepOperations.map((o) => o.stepId),
			...draft.stepDataReads.map((d) => d.stepId)
		]);
		let covered = 0;
		for (const s of steps) {
			if (described.has(s.id)) covered++;
			else
				gaps.push({
					id: `step-shallow-${s.id}`,
					severity: 'info',
					title: t.stepShallow(s.name || t.untitledStep),
					detail: t.stepShallowDetail,
					ref: { nodeId: s.id }
				});
		}
		dimensions.push({ key: 'depth', label: t.depthLabel, covered, total: steps.length, gaps });
	}

	/* 5. Capability areas (cores) are walked by a journey on a screen. */
	{
		const gaps: CoverageGap[] = [];
		const coresWithScreen = new Set(
			journeys
				.filter((j) => steps.some((s) => s.journeyId === j.id && onScreen(s.linkedScreenId)))
				.map((j) => j.coreId)
		);
		let covered = 0;
		for (const c of derivedCores) {
			if (coresWithScreen.has(c.id)) covered++;
			else
				gaps.push({
					id: `core-uncovered-${c.id}`,
					severity: 'info',
					title: t.coreNoScreen(c.name || t.core),
					detail: t.coreNoScreenDetail
				});
		}
		dimensions.push({ key: 'cores', label: t.coresLabel, covered, total: derivedCores.length, gaps });
	}

	/* 6. Roles perform a journey. */
	{
		const gaps: CoverageGap[] = [];
		const actorRoles = new Set(journeys.flatMap((j) => j.actorRoleIds));
		let covered = 0;
		for (const r of ctx.roles) {
			if (actorRoles.has(r.id)) covered++;
			else
				gaps.push({
					id: `role-unused-${r.id}`,
					severity: 'info',
					title: t.roleNoPresence(r.name || t.role),
					detail: t.roleNoPresenceDetail
				});
		}
		dimensions.push({ key: 'roles', label: t.rolesLabel, covered, total: ctx.roles.length, gaps });
	}

	/* 7. Data-model entities are read or written by a step. */
	{
		const gaps: CoverageGap[] = [];
		const used = new Set(draft.stepDataReads.map((d) => norm(d.entityName)));
		let covered = 0;
		for (const name of ctx.entityNames) {
			if (used.has(norm(name))) covered++;
			else
				gaps.push({
					id: `entity-unused-${norm(name)}`,
					severity: 'info',
					title: t.entityUnused(name),
					detail: t.entityUnusedDetail
				});
		}
		dimensions.push({ key: 'entities', label: t.entitiesLabel, covered, total: ctx.entityNames.length, gaps });
	}

	/* ── Roll-up ──────────────────────────────────────────────────────────── */
	const gaps = dimensions
		.flatMap((d) => d.gaps)
		.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

	const applicable = dimensions.filter((d) => d.total > 0);
	const meanRatio = applicable.length
		? applicable.reduce((sum, d) => sum + d.covered / d.total, 0) / applicable.length
		: 0;
	let readinessScore = Math.round(meanRatio * 100);
	// No detector above blocks today; the cap stays for any that would.
	if (gaps.some((g) => g.severity === 'blocking')) readinessScore = Math.min(readinessScore, 55);

	return { dimensions, gaps, readinessScore };
}
