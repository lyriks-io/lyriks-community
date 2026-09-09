/**
 * Step 05 — Plan-coverage analysis. The simulator is the heart of the product
 * plan, so this reads the whole Experience draft (screens + builder tree +
 * journeys + the upstream cores/roles/entities) and answers "how complete and
 * runnable is the plan?": every journey has a screen, every capability area is prototyped,
 * every role can reach something, every entity is used, no dead actions, no broken
 * or orphan navigation. Pure functions only — no store, no IO.
 *
 * Shape mirrors the Step-10 coherence report (dimensions + gaps + readinessScore)
 * so the UI reads familiarly.
 */
import type { ProjectExperienceDraft } from './draft';
import type { BuilderElementNode } from './builder';
import { isSurfaceEmpty, isFieldBuilderKind, isInteractiveBuilderKind } from './builder';
import { collectionKey } from './backend';
import { hostedSurfacesResolver } from './surface-hosting';

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
	/** Present when the gap points at a concrete screen/element (jump target). */
	ref?: CoverageRef;
}

export interface CoverageDimension {
	key: string;
	label: string;
	/** Items satisfied / total considered. `total === 0` ⇒ not applicable yet. */
	covered: number;
	total: number;
	gaps: CoverageGap[];
}

export interface CoverageReport {
	dimensions: CoverageDimension[];
	/** All gaps, flattened and sorted blocking → warning → info. */
	gaps: CoverageGap[];
	/** 0–100. Mean of applicable dimension ratios, capped while any blocker stands. */
	readinessScore: number;
}

export interface CoverageContext {
	roles: { id: string; name: string }[];
	/** Entity names from the Step-07 data model (for "is every entity used?"). */
	entityNames: string[];
}

const SEVERITY_RANK: Record<CoverageSeverity, number> = { blocking: 0, warning: 1, info: 2 };
const norm = (s: string) => s.trim().toLowerCase();

/** Element nodes of the whole builder (across every surface). */
function elementNodes(draft: ProjectExperienceDraft): BuilderElementNode[] {
	return Object.values(draft.builder.nodes).filter(
		(n): n is BuilderElementNode => n.kind === 'element'
	);
}

/** Navigate targets emitted by the element nodes that physically live on a surface. */
function ownNavTargets(draft: ProjectExperienceDraft): Map<string, Set<string>> {
	const bySurface = new Map<string, Set<string>>();
	for (const n of elementNodes(draft)) {
		const set = bySurface.get(n.surfaceId) ?? new Set<string>();
		for (const t of n.wiring.transitions)
			if (t.effect.kind === 'navigate' && t.effect.target) set.add(t.effect.target);
		if (n.wiring.binding?.targetKind === 'surface' && n.wiring.binding.targetRef)
			set.add(n.wiring.binding.targetRef);
		bySurface.set(n.surfaceId, set);
	}
	return bySurface;
}

/**
 * Screen ids each screen can navigate to (navigate transitions + surface bindings).
 * Navigation that lives INSIDE a reused component (a group with `componentId`,
 * whose subtree's surfaceId is the component, not the host screen) is attributed
 * to every screen that hosts that component — so a sidebar's links make their
 * targets reachable, transitively across nested components.
 */
function navTargetsByScreen(draft: ProjectExperienceDraft): Map<string, Set<string>> {
	const screenIds = new Set(draft.screens.map((s) => s.id));
	const bySurface = ownNavTargets(draft);
	const hosted = hostedSurfacesResolver(draft.builder.nodes);

	const out = new Map<string, Set<string>>();
	for (const id of screenIds) {
		const acc = new Set<string>();
		for (const surfaceId of hosted(id)) for (const t of bySurface.get(surfaceId) ?? []) acc.add(t);
		out.set(id, acc);
	}
	return out;
}

export function analyzeCoverage(
	draft: ProjectExperienceDraft,
	ctx: CoverageContext
): CoverageReport {
	const dimensions: CoverageDimension[] = [];
	const { screens, journeys, steps, derivedCores } = draft;
	const screenById = new Map(screens.map((s) => [s.id, s]));
	// Elements can live on a reusable component's surface, not just a screen's —
	// name those too, so a gap on a sidebar link doesn't read "Untitled screen".
	const surfaceNameById = new Map<string, string>([
		...screens.map((s) => [s.id, s.name?.trim() ?? ''] as const),
		...draft.components.map((c) => [c.id, c.name?.trim() ?? ''] as const)
	]);
	const screenName = (id: string) => surfaceNameById.get(id) || 'Untitled screen';

	/* ── 1. Screens runnable (entry set + every screen has a layout) ──────── */
	{
		const gaps: CoverageGap[] = [];
		const entry = draft.builder.entryScreenId;
		if (!entry || !screenById.has(entry))
			gaps.push({
				id: 'entry-missing',
				severity: 'blocking',
				title: 'No entry screen',
				detail: 'Set an entry screen so the simulator knows where the run starts.'
			});
		let withLayout = 0;
		for (const s of screens) {
			if (!isSurfaceEmpty(draft.builder, s.id)) withLayout++;
			else
				gaps.push({
					id: `screen-empty-${s.id}`,
					severity: 'warning',
					title: `"${s.name || 'Untitled screen'}" is empty`,
					detail: 'Add a layout so the screen renders something when running.',
					ref: { screenId: s.id }
				});
		}
		dimensions.push({
			key: 'screens',
			label: 'Screens runnable',
			covered: withLayout,
			total: screens.length,
			gaps
		});
	}

	/* ── 2. Journeys land on a screen ─────────────────────────────────────── */
	{
		const gaps: CoverageGap[] = [];
		let covered = 0;
		for (const j of journeys) {
			const js = steps.filter((s) => s.journeyId === j.id);
			const linked = js.filter((s) => s.linkedScreenId && screenById.has(s.linkedScreenId));
			if (js.length > 0 && linked.length > 0) covered++;
			else
				gaps.push({
					id: `journey-unlinked-${j.id}`,
					severity: 'warning',
					title: `"${j.name || 'Journey'}" has no screen`,
					detail:
						js.length === 0
							? 'This journey has no steps. Add steps and link each to a screen.'
							: 'None of this journey’s steps link to a screen yet.'
				});
		}
		dimensions.push({
			key: 'journeys',
			label: 'Journeys → screens',
			covered,
			total: journeys.length,
			gaps
		});
	}

	/* ── 3. Capability areas (cores) are prototyped ───────────────────────── */
	{
		const gaps: CoverageGap[] = [];
		const coresWithScreen = new Set(
			journeys
				.filter((j) =>
					steps.some(
						(s) => s.journeyId === j.id && s.linkedScreenId && screenById.has(s.linkedScreenId)
					)
				)
				.map((j) => j.coreId)
		);
		let covered = 0;
		for (const c of derivedCores) {
			if (coresWithScreen.has(c.id)) covered++;
			else
				gaps.push({
					id: `core-uncovered-${c.id}`,
					severity: 'info',
					title: `Capability area "${c.name || 'Core'}" has no screen`,
					detail: 'No journey under this capability area links to a screen yet.'
				});
		}
		dimensions.push({
			key: 'cores',
			label: 'Capability areas prototyped',
			covered,
			total: derivedCores.length,
			gaps
		});
	}

	/* ── 4. Roles have a presence (actor on a journey, or a gate) ─────────── */
	{
		const gaps: CoverageGap[] = [];
		const actorRoles = new Set(journeys.flatMap((j) => j.actorRoleIds));
		const gates = elementNodes(draft)
			.map((n) => n.wiring.gate)
			.filter((g): g is NonNullable<typeof g> => g != null && g.personaIds.length > 0);
		const gatedRoles = new Set(gates.flatMap((g) => g.personaIds));
		// A viewer-style role can be shaped entirely by DENY gates: an allow-list
		// gate that excludes it is a deliberate statement about that role ("you
		// don't get this button"), so it counts as presence — not a forgotten role.
		// When no gate exists at all, an unused role still reads as undefined.
		const deniedSomewhere = (roleId: string): boolean =>
			gates.some((g) => g.allow !== false && !g.personaIds.includes(roleId));
		let covered = 0;
		for (const r of ctx.roles) {
			if (actorRoles.has(r.id) || gatedRoles.has(r.id) || deniedSomewhere(r.id)) covered++;
			else
				gaps.push({
					id: `role-unused-${r.id}`,
					severity: 'info',
					title: `Role "${r.name || 'role'}" has no presence`,
					detail: 'This role performs no journey and gates no element; its experience is undefined.'
				});
		}
		dimensions.push({
			key: 'roles',
			label: 'Roles covered',
			covered,
			total: ctx.roles.length,
			gaps
		});
	}

	/* ── 5. Data-model entities are used (collection / read / binding) ────── */
	{
		const gaps: CoverageGap[] = [];
		const used = new Set<string>();
		for (const c of draft.builder.collections) used.add(collectionKey(c.name));
		for (const d of draft.stepDataReads) used.add(norm(d.entityName));
		for (const n of elementNodes(draft))
			if (n.wiring.binding?.targetKind === 'entity') used.add(norm(n.wiring.binding.targetRef));
		let covered = 0;
		for (const name of ctx.entityNames) {
			if (used.has(norm(name))) covered++;
			else
				gaps.push({
					id: `entity-unused-${norm(name)}`,
					severity: 'info',
					title: `Entity "${name}" is unused`,
					detail: 'Import it as a collection or bind a list to it so the plan exercises this data.'
				});
		}
		dimensions.push({
			key: 'entities',
			label: 'Data used',
			covered,
			total: ctx.entityNames.length,
			gaps
		});
	}

	/* ── 6. Actions wired (interactive elements that actually do something) ── */
	{
		const gaps: CoverageGap[] = [];
		const interactive = elementNodes(draft).filter(
			(n) => isInteractiveBuilderKind(n.elementKind) && !isFieldBuilderKind(n.elementKind)
		);
		let covered = 0;
		for (const n of interactive) {
			const wired = Boolean(n.wiring.binding) || n.wiring.transitions.length > 0;
			if (wired) covered++;
			else
				gaps.push({
					id: `dead-action-${n.id}`,
					severity: 'warning',
					title: `"${n.label || n.elementKind}" does nothing`,
					detail: `On "${screenName(n.surfaceId)}": add a binding or a flow so this ${n.elementKind} acts.`,
					ref: { screenId: n.surfaceId, nodeId: n.id }
				});
		}
		dimensions.push({
			key: 'actions',
			label: 'Actions wired',
			covered,
			total: interactive.length,
			gaps
		});
	}

	/* ── 7. Navigation integrity (no broken links, no orphan screens) ─────── */
	{
		const gaps: CoverageGap[] = [];
		const targets = navTargetsByScreen(draft);
		// 7a) dangling navigation → blocking
		for (const [fromId, set] of targets)
			for (const to of set)
				if (!screenById.has(to))
					gaps.push({
						id: `nav-broken-${fromId}-${to}`,
						severity: 'blocking',
						title: `Broken link on "${screenName(fromId)}"`,
						detail: 'A navigation targets a screen that no longer exists.',
						ref: { screenId: fromId }
					});
		// 7b) orphan screens — unreachable from the entry screen
		const entry = draft.builder.entryScreenId;
		let reachableCount = screens.length;
		if (entry && screenById.has(entry) && screens.length > 1) {
			const seen = new Set<string>([entry]);
			const queue = [entry];
			while (queue.length) {
				const cur = queue.shift() as string;
				for (const to of targets.get(cur) ?? [])
					if (screenById.has(to) && !seen.has(to)) {
						seen.add(to);
						queue.push(to);
					}
			}
			reachableCount = seen.size;
			for (const s of screens)
				if (!seen.has(s.id))
					gaps.push({
						id: `orphan-${s.id}`,
						severity: 'warning',
						title: `"${s.name || 'Untitled screen'}" is unreachable`,
						detail: 'No navigation leads here from the entry screen. Add a link or make it the entry.',
						ref: { screenId: s.id }
					});
		}
		dimensions.push({
			key: 'navigation',
			label: 'Navigation reachable',
			covered: reachableCount,
			total: screens.length,
			gaps
		});
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
	// A blocker means the plan can't run end-to-end — cap the headline number.
	if (gaps.some((g) => g.severity === 'blocking')) readinessScore = Math.min(readinessScore, 55);

	return { dimensions, gaps, readinessScore };
}
