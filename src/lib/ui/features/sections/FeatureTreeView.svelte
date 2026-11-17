<script lang="ts">
	import {
		Icon,
		FilterBar,
		createFilter,
		matchesQuery,
		MATURITY_STAGES,
		MATURITY_STAGE_COUNT,
		stageFromScore,
		clampStageLevel,
		stageLabel,
		confirmDialog,
		promptDialog,
		floatInView,
	} from "$ui/design-system";
	import { invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import { anchorKeyFromUrl, flashElement } from "$ui/shell/focus-field";
	import {
		familiesDirectlyUnderCore,
		lonePathBelow,
		featuresDirectlyUnderCore,
		featuresDirectlyUnderFamily,
		subFamiliesOf,
		familyIdsUnderCore,
		familyIdsUnderFamily,
		featureIdsUnderCore,
		readableName,
		sortByName,
		type Family,
		type Feature,
	} from "$domain/features";
	import { tick, untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";
	import type { KernelRulesReadModel } from "$application/specification/index-feature-rules";
	import type { BehaviorOverview } from "$application/specification/summarize-behavior";
	import StatsButton from "../StatsButton.svelte";
	import EdgeCaseCard from "$ui/rules/EdgeCaseCard.svelte";
	import ActionHoverCard from "../ActionHoverCard.svelte";
	import {
		nestKernelRules,
		type ActionRules,
		type PlacedRules,
	} from "$application/specification/nest-kernel-rules";
	import KernelRuleLines from "$ui/rules/KernelRuleLines.svelte";
	import type { RulesStore } from "$ui/rules/draft-store.svelte";
	import type {
		FeatureAdvice,
		FeatureImplementationCoverage,
	} from "$application/use-cases";
	import type {
		FeatureAction,
		FeatureActionIndex,
	} from "$application/specification/index-feature-actions";
	import type { Collaborator } from "$domain/team";
	import type { WorkTarget } from "$domain/features";
	import type { FeaturesStore } from "../draft-store.svelte";
	import { NEUTRAL_CORE_STYLE } from "../core-colors";
	import { unspaActionPath } from "../unspa-dashboard-url";
	import AdvisorBadge from "../AdvisorBadge.svelte";
	import ImplementationBadge from "../ImplementationBadge.svelte";
	import RowMenu from "../RowMenu.svelte";
	import { oneMenu } from "../one-menu.svelte";

	interface Props {
		store: FeaturesStore;
		advice: FeatureAdvice[];
		/** Authored actions per leaf, from the behavior kernel (read-only). */
		featureActions: FeatureActionIndex;
		/** In-process maturity % per leaf (the readiness dimension's own numbers):
		    the maturity badge falls back to it while the engine advice is still
		    empty, so a freshly authored project shows its stage without waiting
		    for the background advisor refresh. */
		maturity?: ReadonlyMap<string, number>;
		/** Per-leaf code-implementation coverage (adoption sidecar); a leaf absent
		    from the map simply shows no chip. */
		implementation?: ReadonlyMap<string, FeatureImplementationCoverage>;
		/** Team members — an action's owner and the contributors a feature/action carries. */
		collaborators: Collaborator[];
		/** Opens the Behavior tab's EMBEDDED editor on `path` (null = the project). */
		onOpenEditor?: (path?: string | null) => void;
		/** Opens an action's details in the feature drawer (spec: criterion d97b639e). */
		onOpenAction?: (featureId: string, actionId: string) => void;
		/** The behavior read model behind the stats icons (toolbar and rows). */
		overview?: BehaviorOverview;
		/** The behavior model's rules, by feature: each feature and action opens its own. */
		kernelRules?: KernelRulesReadModel;
		/** The rules section: Given / When / Then criteria and the rules declared in Foundation. */
		rulesStore?: RulesStore | null;
		/** A Given / When / Then criterion to open on landing (an old link to the rules tab). */
		focusCaseId?: string | null;
	}
	let {
		store,
		advice,
		featureActions,
		maturity = new Map(),
		implementation = new Map(),
		collaborators,
		onOpenEditor,
		onOpenAction,
		overview,
		kernelRules = { groups: [], total: 0, missingDescription: 0 },
		rulesStore = null,
		focusCaseId = null,
	}: Props = $props();

	/* Each feature's rules, arranged the way its spec is written (screen, then
	   action, then the screen's own), so a feature row and each of its action
	   rows open exactly their own. The groups no tree feature holds (the
	   project's own statements, a feature outside the tree) read at the foot of
	   the tree instead, so no rule is left without a place. */
	const treeFeatureIds = $derived(new Set(store.draft.features.map((f) => f.id)));
	const placedRules = $derived(
		new Map<string, PlacedRules & { count: number }>(
			kernelRules.groups
				.filter((g) => g.featureId && treeFeatureIds.has(g.featureId))
				.map((g) => [
					g.featureId as string,
					{ ...nestKernelRules(g.rules), count: g.rules.length },
				]),
		),
	);
	const rulesOfAction = (
		featureId: string,
		action: FeatureAction,
	): ActionRules | null =>
		placedRules
			.get(featureId)
			?.surfaces.find((s) => s.surfaceId === action.surfaceId)
			?.actions.find((a) => a.actionId === action.id) ?? null;

	/* Given / When / Then acceptance criteria are written in the panel of the
	   feature they test; one naming no feature reads in the behavior editor only. */
	const cases = $derived(rulesStore?.draft.scenarios ?? []);
	const caseFeatures = $derived(
		store.draft.features.map((f) => ({ id: f.id, name: f.name })),
	);
	/* A criterion testing no feature reads nowhere in the tree. When a link (the
	   the Fix now of a point Lyriks noticed) names one, it shows on top of the tree with the
	   list of features to attach it to, until it is attached or dismissed. */
	let unattachedCaseId = $state<string | null>(null);
	const unattachedCase = $derived(
		cases.find(
			(c) =>
				c.id === unattachedCaseId &&
				!(c.relatedFeatureId && treeFeatureIds.has(c.relatedFeatureId)),
		) ?? null,
	);
	// Once attached, the criterion reads under its feature: open that feature.
	$effect(() => {
		if (!unattachedCaseId || unattachedCase) return;
		const attached = untrack(() => cases.find((c) => c.id === unattachedCaseId));
		unattachedCaseId = null;
		if (attached?.relatedFeatureId) untrack(() => store.selectFeature(attached.relatedFeatureId as string));
	});

	// Which feature's behavior figures are open, from Statistics in its row menu.
	const statsOpen = $state<Record<string, boolean>>({});

	async function renameFeature(feat: Feature) {
		const name = await promptDialog({
			title: "Rename the feature",
			initial: feat.name,
			placeholder: "Feature name",
			confirmLabel: "Rename",
		});
		const next = name?.trim();
		if (!next || next === feat.name) return;
		store.updateFeature(feat.id, "name", next);
	}

	// An action lives in its feature's behavior model, so renaming or deleting it
	// goes through the engine's write path; the page reloads the tree afterwards.
	async function applyBehavior(
		featureId: string,
		operations: Record<string, unknown>[],
		failure: string,
	): Promise<boolean> {
		const res = await fetch("/api/behavior/apply", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ projectId: store.draft.projectId, featureId, operations }),
		}).catch(() => null);
		const body = (await res?.json().catch(() => null)) as { batch?: { ok?: boolean; errors?: string[] } } | null;
		if (!res?.ok || body?.batch?.ok === false) {
			store.notifier.notify("error", body?.batch?.errors?.[0] ?? failure);
			return false;
		}
		await invalidateAll();
		return true;
	}

	async function renameAction(featureId: string, action: FeatureAction) {
		const name = await promptDialog({
			title: "Rename the action",
			initial: readableName(action.name),
			placeholder: "Action name",
			confirmLabel: "Rename",
		});
		const next = name?.trim();
		if (!next || next === action.name) return;
		await applyBehavior(
			featureId,
			[{ kind: "update_action", surfaceId: action.surfaceId, actionId: action.id, name: next }],
			`Could not rename the action “${readableName(action.name)}”.`,
		);
	}

	// A new action lands on the feature's first screen (one named after the
	// feature is created when it has none), with no rule decided yet: the engine
	// asks every action to say what gates it, and "nothing yet" is said as a rule.
	async function addAction(feat: Feature) {
		const name = (
			await promptDialog({ title: "Add an action", placeholder: "What a user can do", confirmLabel: "Add" })
		)?.trim();
		if (!name) return;
		// A feature added a moment ago may still sit in the debounced save, and
		// the engine only writes into a feature the saved tree already holds.
		await store.flushNow();
		const res = await fetch(
			`/api/behavior/feature?projectId=${encodeURIComponent(store.draft.projectId)}&featureId=${encodeURIComponent(feat.id)}`,
		).catch(() => null);
		const read = (await res?.json().catch(() => null)) as {
			snapshot?: { feature?: { surfaces?: { id: string }[] } };
		} | null;
		const surfaceId = read?.snapshot?.feature?.surfaces?.[0]?.id ?? null;
		const where = surfaceId
			? { surfaceId }
			: { surfaceRef: "screen" };
		const operations: Record<string, unknown>[] = [
			...(surfaceId
				? []
				: [
						{
							kind: "add_surface",
							ref: "screen",
							name: feat.name || "Main screen",
							type: "screen",
							description: "The screen this feature happens on; not described yet.",
						},
					]),
			{ kind: "add_action", ref: "action", ...where, name, intent: "Not described yet." },
			{
				kind: "add_action_rule",
				...where,
				actionRef: "action",
				rule: {
					category: "permissions",
					effect: {
						type: "allow_action",
						description: "Not decided yet: anyone who can open the screen may do it, until a rule says otherwise.",
					},
					description: "No rule decided yet.",
				},
			},
		];
		const done = await applyBehavior(feat.id, operations, `Could not add the action “${name}”.`);
		if (done) {
			expanded[feat.id] = true;
			store.notifier.notify("info", `Action “${name}” added.`);
		}
	}

	// Its rules and scenarios go with it, so the person confirms first.
	async function deleteAction(featureId: string, action: FeatureAction) {
		const name = readableName(action.name);
		const ok = await confirmDialog({
			title: `Delete the action “${name}”?`,
			message: "Its rules and scenarios go with it. This cannot be undone.",
			confirmLabel: "Delete action",
			danger: true,
		});
		if (!ok) return;
		const done = await applyBehavior(
			featureId,
			[{ kind: "remove_action", surfaceId: action.surfaceId, actionId: action.id }],
			`Could not delete the action “${name}”.`,
		);
		if (done) store.notifier.notify("info", `Action “${name}” deleted.`);
	}

	// A feature goes from the bottom up: its row menu offers the delete only once
	// it holds no action, and what goes with it is named before it goes.
	async function deleteFeature(feat: Feature) {
		if (actionsOf(feat.id).length > 0) return;
		const name = feat.name || "unnamed";
		const ok = await confirmDialog({
			title: `Delete the feature “${name}”?`,
			message:
				"Its release, tier, ownership and acceptance criteria go with it. This cannot be undone.",
			confirmLabel: "Delete feature",
			danger: true,
		});
		if (!ok) return;
		store.removeFeature(feat.id);
		store.notifier.notify("info", `Feature “${name}” deleted.`);
	}

	// Every delete in the tree is confirmed first (spec: criterion a331eece). A
	// core or a family offers its delete only once it is empty, so nothing else
	// goes with it.
	async function deleteCore(core: { id: string; name: string }) {
		const name = core.name || "unnamed";
		const ok = await confirmDialog({
			title: `Delete the core-feature “${name}”?`,
			message: "It holds nothing anymore. This cannot be undone.",
			confirmLabel: "Delete core",
			danger: true,
		});
		if (!ok) return;
		store.removeCore(core.id);
		store.notifier.notify("info", `Core-feature “${name}” deleted.`);
	}

	async function deleteFamily(family: Family) {
		const name = family.name || "unnamed";
		const ok = await confirmDialog({
			title: `Delete the family “${name}”?`,
			message: "It holds nothing anymore. This cannot be undone.",
			confirmLabel: "Delete family",
			danger: true,
		});
		if (!ok) return;
		store.removeFamily(family.id);
		store.notifier.notify("info", `Family “${name}” deleted.`);
	}

	/* Unfolded rule lists: `act:<feature>:<surface>:<action>` for one action's. A
	   feature unfolds with its row's own chevron (`expanded`). */
	const openRules = new SvelteSet<string>();
	const toggleRules = (key: string) => {
		if (openRules.has(key)) openRules.delete(key);
		else openRules.add(key);
	};
	/* Features showing every rule at once (Show all rules in the row menu): each
	   action's, and the ones on the whole surface or feature. Off, an unfolded
	   feature reads as its actions alone; turning it on unfolds the feature. */
	const allRules = new SvelteSet<string>();
	const toggleAllRules = (featureId: string) => {
		if (allRules.has(featureId)) allRules.delete(featureId);
		else {
			allRules.add(featureId);
			expanded[featureId] = true;
		}
	};
	const actionRulesKey = (featureId: string, action: FeatureAction) =>
		`act:${featureId}:${action.surfaceId}:${action.id}`;

	// An old link to the rules tab names a case: open the place it now reads in.
	$effect(() => {
		if (!focusCaseId) return;
		const target = untrack(() => cases.find((c) => c.id === focusCaseId));
		if (!target) return;
		untrack(() => {
			const home =
				target.relatedFeatureId && treeFeatureIds.has(target.relatedFeatureId)
					? target.relatedFeatureId
					: null;
			if (home) store.selectFeature(home);
			else unattachedCaseId = target.id;
		});
	});

	/* Where an action opens: the Behavior tab's framed editor, on the action
	   itself (its surface selected and its own card expanded) rather than on the
	   surface that merely hosts it. Nothing here opens a dedicated tab. */
	const actionPath = (featureId: string, action: FeatureAction): string =>
		unspaActionPath(featureId, action.surfaceId, action.id);

	// Work-queue helpers, shared by the core / feature / action rows. A target is
	// "queued" when an assignment exists for it; assigning implicitly queues it.
	const assigneeOf = (target: WorkTarget): string | null =>
		store.getAssignment(target)?.assigneeId ?? null;
	const isQueued = (target: WorkTarget): boolean =>
		!!store.getAssignment(target);

	/* Expanded action lists by feature id — collapsed by default so the tree
	   still reads as a tree; a chevron opens the feature's actions. */
	let expanded = $state<Record<string, boolean>>({});
	const toggleExpand = (id: string) => (expanded[id] = !expanded[id]);
	/* A row folds and unfolds wherever it is clicked (spec: criterion 3b3ad8ae),
	   except on what does its own thing there: a button, a link, a menu or a card. */
	function toggleFromRow(e: MouseEvent, toggle: () => void) {
		const own = 'button, a, input, select, textarea, [role="menu"], [role="tooltip"]';
		if ((e.target as HTMLElement).closest(own)) return;
		toggle();
	}
	/* Pointing at a row says where the click goes (spec: criterion e5cef7ab): the hand stays
	   over the whole row, and the chevron (data-fold) lights up wherever a click folds the row,
	   but stays quiet over the buttons, links and pickers that keep their own click. */
	const FOLD_ROW = "group/fold cursor-pointer";
	const FOLD_CHEVRON =
		"cursor-pointer rounded-sm text-ink-400 group-hover/fold:bg-brand-50 group-hover/fold:text-brand-600 group-has-[:is(button,a,select):not([data-fold]):hover]/fold:bg-transparent group-has-[:is(button,a,select):not([data-fold]):hover]/fold:text-ink-400";

	async function renameCore(core: { id: string; name: string }) {
		const name = await promptDialog({
			title: "Rename the core",
			initial: core.name,
			placeholder: "Core name",
			confirmLabel: "Rename",
		});
		const next = name?.trim();
		if (!next || next === core.name) return;
		store.updateCore(core.id, "name", next);
	}

	async function renameFamily(family: Family) {
		const name = await promptDialog({
			title: "Rename the family",
			initial: family.name,
			placeholder: "Family name",
			confirmLabel: "Rename",
		});
		const next = name?.trim();
		if (!next || next === family.name) return;
		store.updateFamily(family.id, "name", next);
	}

	// A core is named when it is created: no name in the tree is a text field.
	// The new core then opens where it landed (spec: criterion 475c8d04):
	// unfolded, scrolled to and flashed. A search or filter would hide an empty
	// core, so it is cleared first, and its restore effect must settle before
	// the core is unfolded or it would fold it back.
	async function newCore() {
		const name = await promptDialog({
			title: "New core-feature",
			placeholder: "Core name",
			confirmLabel: "Create",
		});
		const next = name?.trim();
		if (!next) return;
		if (treeFilter.active) {
			treeFilter.clear();
			await tick();
		}
		const coreId = store.addCore({ name: next });
		openCores[coreId] = true;
		await tick();
		flashElement(
			document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(coreId)}"]`),
		);
	}

	const actionsOf = (featureId: string): FeatureAction[] =>
		featureActions[featureId] ?? [];

	/** A leaf's spec maturity stage, read the way its badge reads it. */
	function stageOf(feat: Feature): string | null {
		const manual = store.getLeafMeta(feat.id).stage ?? null;
		const score =
			adviceByFeature.get(feat.id)?.score?.percentage ??
			maturity.get(feat.id) ??
			null;
		const level =
			manual != null
				? clampStageLevel(manual)
				: score != null
					? stageFromScore(score)
					: null;
		return level == null ? null : stageLabel(level);
	}

	/* The same toolbar as the rule inventory: the search box, one Filters
	   button holding every facet, the chips of what is selected, the count. */
	const treeFilter = createFilter<Feature>({
		noun: "features",
		placeholder: "Search a core, family, feature or action…",
		fields: (f) => [
			f.name,
			f.description,
			...actionsOf(f.id).flatMap((a) => [
				a.name,
				readableName(a.name),
				a.intent,
				a.surfaceName,
			]),
		],
		facets: [
			{
				key: "core",
				label: "Core",
				value: (f) =>
					store.draft.cores.find((c) => c.id === f.coreId)?.name ||
					null,
			},
			{
				key: "release",
				label: "Release",
				noneLabel: "No release",
				value: (f) => {
					const id = store.getReleaseAssignment(f.id);
					const r = id
						? store.draft.releases.find((x) => x.id === id)
						: null;
					return r ? r.name || r.version : null;
				},
			},
			{
				key: "maturity",
				label: "Spec maturity",
				options: MATURITY_STAGES.map((st) => ({
					value: st.label,
					label: st.label,
				})),
				value: stageOf,
			},
			{
				key: "owner",
				label: "Owner",
				noneLabel: "Unassigned",
				value: (f) => {
					const id = assigneeOf({ kind: "feature", featureId: f.id });
					return id
						? (collaborators.find((c) => c.id === id)?.name ?? id)
						: null;
				},
			},
			{
				key: "queued",
				label: "Queued for work",
				kind: "toggle",
				value: (f) => isQueued({ kind: "feature", featureId: f.id }),
			},
		],
	});
	const search = $derived(treeFilter.query);
	const searching = $derived(treeFilter.active);

	/* The tree keeps the path to every feature kept: a feature stays when it
	   (or one of its actions) passes the search and the facets, a family when
	   it still holds one, a core when anything under it survives. Matching a
	   CONTAINER's name (a core or a family) shows everything inside it that the
	   facets keep, because searching "Billing" means "show me Billing". */
	/** Actions of a feature narrowed to the query; the full list when not searching text. */
	function visibleActions(
		featureId: string,
		inherited: boolean,
	): FeatureAction[] {
		const all = sortByName(actionsOf(featureId), (a) => readableName(a.name));
		if (!search.trim() || inherited) return all;
		const hits = all.filter((a) =>
			matchesQuery(search, a.name, readableName(a.name), a.intent, a.surfaceName),
		);
		return hits.length > 0 ? hits : all;
	}
	const featureHit = (feat: Feature): boolean => treeFilter.matches(feat);
	const featureKept = (feat: Feature, inherited: boolean): boolean =>
		inherited ? treeFilter.matchesFacets(feat) : featureHit(feat);
	function familyHit(family: Family, inherited = false): boolean {
		const within =
			inherited ||
			(!!search.trim() &&
				matchesQuery(search, family.name, family.description));
		return (
			featuresDirectlyUnderFamily(store.draft, family.id).some((f) =>
				featureKept(f, within),
			) ||
			subFamiliesOf(store.draft, family.id).some((c) =>
				familyHit(c, within),
			)
		);
	}
	/** Features/families of a container, A to Z, narrowed unless nothing narrows. */
	const keepFeatures = (list: Feature[], inherited: boolean): Feature[] =>
		sortByName(!searching ? list : list.filter((f) => featureKept(f, inherited)));
	const keepFamilies = (list: Family[], inherited: boolean): Family[] =>
		sortByName(!searching ? list : list.filter((f) => familyHit(f, inherited)));

	/** Does a container on a leaf's path (its core, a family above it) match the text? */
	function pathMatches(feat: Feature): boolean {
		if (!search.trim()) return false;
		const core = store.draft.cores.find((c) => c.id === feat.coreId);
		if (core && matchesQuery(search, core.name, core.description))
			return true;
		let familyId = feat.parentFamilyId;
		while (familyId) {
			const family = store.draft.families.find((f) => f.id === familyId);
			if (!family) break;
			if (matchesQuery(search, family.name, family.description))
				return true;
			familyId = family.parentFamilyId;
		}
		return false;
	}

	/** How many leaves the tree shows, for the "n of m" readout: the same rule as the tree. */
	const matchCount = $derived(
		searching
			? store.draft.features.filter(
					(f) =>
						featureHit(f) ||
						(pathMatches(f) && treeFilter.matchesFacets(f)),
				).length
			: store.draft.features.length,
	);

	const adviceByFeature = $derived(
		new Map(advice.map((a) => [a.featureId, a])),
	);

	/* ── drag-and-drop state ──────────────────────────────────────────────
	   `dragId` is the feature being dragged; `overZone` is the id of the drop
	   target currently under the cursor (for the highlight ring). Zones are
	   namespaced: `feat:<id>` (reorder/adopt), `fam:<id>` (join family),
	   `core:<id>` (leave family → core root). */
	let dragId = $state<string | null>(null);
	let overZone = $state<string | null>(null);

	/* ── row/family actions dropdown ──────────────────────────────────────
	   A single open-menu id (`feat:<id>` or `fam:<id>`); a window click closes
	   it. Menu buttons stopPropagation so opening one doesn't immediately
	   re-close it via the window handler. */
	let openMenu = $state<string | null>(null);
	const familyMenuId = Symbol("family menu");
	const toggleMenu = (key: string) => {
		openMenu = openMenu === key ? null : key;
		if (openMenu) oneMenu.claim(familyMenuId);
	};
	// Another menu of the tree opening closes the family one (one at a time).
	$effect(() => {
		const owner = oneMenu.owner;
		if (owner !== null && owner !== familyMenuId) untrack(() => (openMenu = null));
	});

	/* The tree opens folded: a core shows its name and its counters, a family its
	   name, until the reader unfolds them with their chevron. These three maps are
	   the only thing that decides what is open, so every chevron keeps working
	   while a search or a filter is active: a filter unfolds the path to its hits
	   once (below), it never pins anything open. A feature reached from a link or
	   its details panel unfolds the core and families above it the same way. */
	let openCores = $state<Record<string, boolean>>({});
	const toggleCore = (id: string) => {
		openCores[id] = !openCores[id];
		if (openCores[id]) unfoldLonePath(lonePathBelow(store.draft, { coreId: id }));
	};
	let openFamilies = $state<Record<string, boolean>>({});
	const toggleFamily = (id: string) => {
		openFamilies[id] = !openFamilies[id];
		if (openFamilies[id]) unfoldLonePath(lonePathBelow(store.draft, { familyId: id }));
	};
	/* Unfolding a grouping that holds one thing opens that thing too, down to the
	   first level with a real choice (lonePathBelow). Folding never cascades. */
	function unfoldLonePath(path: { familyIds: string[]; featureId: string | null }) {
		for (const id of path.familyIds) openFamilies[id] = true;
		if (path.featureId) expanded[path.featureId] = true;
	}
	/* A folded counter opens what it counts (spec: criterion a8d438f1): the
	   features number unfolds the grouping and every family under it and folds
	   each of its features, so only the features show; the actions number
	   unfolds each of those features instead, so their actions show. */
	function openToCount(
		grouping: { coreId: string } | { familyId: string },
		withActions: boolean,
	) {
		const familyIds =
			"coreId" in grouping
				? familyIdsUnderCore(store.draft, grouping.coreId)
				: familyIdsUnderFamily(store.draft, grouping.familyId);
		if ("coreId" in grouping) openCores[grouping.coreId] = true;
		for (const id of familyIds) openFamilies[id] = true;
		const featureIds =
			"coreId" in grouping
				? featureIdsUnderCore(store.draft, grouping.coreId)
				: featuresUnderFamily(grouping.familyId).map((f) => f.id);
		for (const id of featureIds) expanded[id] = withActions;
	}

	const revealTarget = $derived(store.selectedFeatureId ?? anchorKeyFromUrl(page.url));
	$effect(() => {
		const target = revealTarget;
		if (!target) return;
		untrack(() => {
			const { features, families } = store.draft;
			const node =
				features.find((f) => f.id === target) ??
				families.find((f) => f.id === target) ??
				null;
			if (!node) return;
			openCores[node.coreId] = true;
			let parent = node.parentFamilyId;
			while (parent && !openFamilies[parent]) {
				openFamilies[parent] = true;
				parent = families.find((f) => f.id === parent)?.parentFamilyId ?? null;
			}
		});
	});

	/* When a search or a filter starts or changes, unfold the path to what it
	   keeps: the core and families above every kept feature, plus the feature
	   itself whenever the text hits one of its actions (its own name matching
	   too or not), so the matching actions show. A facet filter alone leaves the
	   features folded. It runs again when the actions arrive after the query.
	   The tree as it was before the first narrowing comes back once it clears. */
	let beforeFilter: {
		cores: Record<string, boolean>;
		families: Record<string, boolean>;
		features: Record<string, boolean>;
	} | null = null;
	const filterKey = $derived(
		searching ? JSON.stringify([search.trim(), treeFilter.selected]) : "",
	);
	$effect(() => {
		const key = filterKey;
		void featureActions;
		untrack(() => {
			if (key) {
				beforeFilter ??= {
					cores: { ...openCores },
					families: { ...openFamilies },
					features: { ...expanded },
				};
				unfoldToHits();
			} else if (beforeFilter) {
				openCores = beforeFilter.cores;
				openFamilies = beforeFilter.families;
				expanded = beforeFilter.features;
				beforeFilter = null;
			}
		});
	});
	function unfoldToHits() {
		const text = search.trim();
		const { features, families } = store.draft;
		for (const feat of features) {
			const kept =
				featureHit(feat) || (pathMatches(feat) && treeFilter.matchesFacets(feat));
			if (!kept) continue;
			openCores[feat.coreId] = true;
			let parent = feat.parentFamilyId;
			while (parent) {
				openFamilies[parent] = true;
				parent = families.find((f) => f.id === parent)?.parentFamilyId ?? null;
			}
			const hitInActions =
				!!text &&
				actionsOf(feat.id).some((a) =>
					matchesQuery(text, a.name, readableName(a.name), a.intent, a.surfaceName),
				);
			if (hitInActions) expanded[feat.id] = true;
		}
	}

	/** Actions authored under the features of a core: the second counter of a folded core. */
	const actionCountOfCore = (coreId: string): number =>
		store.draft.features
			.filter((f) => f.coreId === coreId)
			.reduce((n, f) => n + actionsOf(f.id).length, 0);
	const word = (n: number, one: string, many: string) => (n === 1 ? one : many);
	/** Every leaf under a family, its sub-families included: what the family row counts. */
	const featuresUnderFamily = (familyId: string): Feature[] => [
		...featuresDirectlyUnderFamily(store.draft, familyId),
		...subFamiliesOf(store.draft, familyId).flatMap((c) => featuresUnderFamily(c.id)),
	];

	function startDrag(e: DragEvent, id: string) {
		dragId = id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", id);
		}
	}
	function endDrag() {
		dragId = null;
		overZone = null;
	}
	/** Allow a drop on `zone` (preventDefault is required for `drop` to fire). */
	function over(e: DragEvent, zone: string, stop = false) {
		if (!dragId) return;
		e.preventDefault();
		if (stop) e.stopPropagation();
		overZone = zone;
	}
	function leave(zone: string) {
		if (overZone === zone) overZone = null;
	}
	function dropOnFeature(e: DragEvent, targetId: string) {
		e.preventDefault();
		e.stopPropagation();
		if (dragId) store.reorderFeatureBefore(dragId, targetId);
		endDrag();
	}
	function dropOnFamily(e: DragEvent, family: Family) {
		e.preventDefault();
		e.stopPropagation();
		if (dragId) store.moveFeature(dragId, family.coreId, family.id);
		endDrag();
	}
	function dropOnCoreRoot(e: DragEvent, coreId: string) {
		e.preventDefault();
		if (dragId) store.moveFeature(dragId, coreId, null);
		endDrag();
	}

	/** Every core and every row share one neutral look (see NEUTRAL_CORE_STYLE). */
	const style = NEUTRAL_CORE_STYLE;
</script>

<!-- Click anywhere closes an open row/family actions menu. -->
<svelte:window onclick={() => (openMenu = null)} />

<!-- @container so core cards reflow to the tree column width, not the viewport. -->
<div class="@container" data-anchor="feature-tree">
	{#if unattachedCase && rulesStore}
		<section class="mb-4 rounded-card border border-warning-200 bg-warning-50/50 p-3">
			<div class="mb-2 flex items-center gap-2">
				<Icon name="alert-triangle" size={14} class="text-warning-600" />
				<p class="text-xs font-semibold text-ink-800">This acceptance criterion tests no feature</p>
				<span class="text-[0.6875rem] text-ink-500">Pick the feature it tests to place it in the tree.</span>
				<button
					type="button"
					onclick={() => (unattachedCaseId = null)}
					class="ml-auto text-ink-400 hover:text-ink-700"
					aria-label="Dismiss"
				>
					<Icon name="x" size={14} />
				</button>
			</div>
			<EdgeCaseCard store={rulesStore} edgeCase={unattachedCase} features={caseFeatures} />
		</section>
	{/if}
	<div class="mb-3 flex items-start gap-2">
		<FilterBar
			filter={treeFilter}
			items={store.draft.features}
			showCount={false}
			size="md"
			class="min-w-0 flex-1"
		/>
		{#if overview}
			<StatsButton {overview} {implementation} title="Behavior of the product" size="md" />
		{/if}
		<!-- Starting a core is the page's main call to action (spec: criterion 475c8d04). -->
		<button
			type="button"
			onclick={() => void newCore()}
			class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-field bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-600"
		>
			<Icon name="plus" size={14} /> New core-feature
		</button>
	</div>
	<!-- One list panel, read as a table: a core per row, its counts in columns
	     that line up from one row to the next, its content unfolding in place.
	     Each count carries its own word, so the panel needs no header row. -->
	<!-- No overflow-hidden here: it clipped the action cards and row menus that open
	     past the panel's edge; the first and last rows round their own corners. -->
	<div class="rounded-card border border-line bg-surface shadow-card [&>*:last-child]:rounded-b-card">
		<div class="divide-y divide-line [&>*:first-child]:rounded-t-card">
		{#each sortByName(store.draft.cores) as core (core.id)}
			<!-- `coreMatched` = the core's own name/description matched, so everything
		     under it renders unfiltered (see the search block above). -->
			{@const coreMatched = matchesQuery(
				search,
				core.name,
				core.description,
			)}
			{@const features = keepFeatures(
				featuresDirectlyUnderCore(store.draft, core.id),
				coreMatched,
			)}
			{@const families = keepFamilies(
				familiesDirectlyUnderCore(store.draft, core.id),
				coreMatched,
			)}
			{@const leafCount = store.draft.features.filter(
				(f) => f.coreId === core.id,
			).length}
			{@const coreEmpty =
				leafCount === 0 &&
				familiesDirectlyUnderCore(store.draft, core.id).length === 0}
			{@const hiddenByQuery =
				searching && features.length === 0 && families.length === 0}
			{#if !hiddenByQuery}
				{@const coreTarget = {
					kind: "core",
					coreId: core.id,
				} as WorkTarget}
				{@const coreOpen = !!openCores[core.id]}
				{@const actionCount = actionCountOfCore(core.id)}
				<!-- Whole-card core drop target: dropping anywhere on the card re-homes the
		     feature to the core root (detached from any family). Feature/family
		     zones stopPropagation, so nesting drops still win over this. -->
				<div
					role="group"
					aria-label={core.name || "core"}
					data-anchor={core.id}
					ondragover={(e) => over(e, `core:${core.id}`)}
					ondragleave={() => leave(`core:${core.id}`)}
					ondrop={(e) => dropOnCoreRoot(e, core.id)}
					class="group/dom relative min-w-0 transition-colors {coreOpen
						? 'bg-surface-sunken/30'
						: 'hover:bg-surface-sunken/40'}"
				>
					{#if dragId && overZone === `core:${core.id}`}
						<div
							class="pointer-events-none absolute inset-0 z-30 flex items-start justify-center rounded-card border-2 border-dashed border-current {style.text}"
						>
							<span
								class="mt-2 rounded-pill bg-surface px-2 py-0.5 text-[0.625rem] font-semibold shadow-card {style.text}"
							>
								Drop to move into {core.name || "core"}
							</span>
						</div>
					{/if}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the chevron is the keyboard path; the row is a larger mouse target for it) -->
					<div
						onclick={(e) => toggleFromRow(e, () => toggleCore(core.id))}
						class="{FOLD_ROW} grid grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_6.5rem_2rem] items-center gap-3 px-5 py-3"
					>
						<button
							type="button"
							data-fold
							onclick={() => toggleCore(core.id)}
							class="grid size-5 shrink-0 place-items-center {FOLD_CHEVRON}"
							aria-label={coreOpen ? "Fold core" : "Unfold core"}
							aria-expanded={coreOpen}
						>
							<Icon
								name="chevron-right"
								size={14}
								class="transition-transform {coreOpen ? 'rotate-90' : ''}"
							/>
						</button>
						<div class="min-w-0">
							<p
								class="truncate text-[0.9375rem] font-semibold {core.name
									? 'text-ink-900'
									: 'italic text-ink-400'}"
							>
								{core.name || "Unnamed core"}
							</p>
							{#if core.description}
								<p class="truncate text-xs text-ink-500" title={core.description}>
									{core.description}
								</p>
							{/if}
						</div>
						<!-- The counts summarise what a folded core hides; unfolded, the
						     content itself shows, so they give way. -->
						<span class="text-right">
							{#if !coreOpen}
								<button
									type="button"
									onclick={() => openToCount({ coreId: core.id }, false)}
									title="Show its {leafCount} {word(leafCount, 'feature', 'features')}"
									class="group/count cursor-pointer text-sm tabular-nums hover:underline"
								><span class="font-semibold text-ink-800 group-hover/count:text-brand-600">{leafCount}</span>
									<span class="text-ink-500 group-hover/count:text-brand-600">{word(leafCount, 'feature', 'features')}</span></button>
							{/if}
						</span>
						<span class="text-right">
							{#if !coreOpen}
								<button
									type="button"
									onclick={() => openToCount({ coreId: core.id }, true)}
									title="Show its features with their {actionCount} {word(actionCount, 'action', 'actions')}"
									class="group/count cursor-pointer text-sm tabular-nums hover:underline"
								><span class="font-semibold text-ink-800 group-hover/count:text-brand-600">{actionCount}</span>
									<span class="text-ink-500 group-hover/count:text-brand-600">{word(actionCount, 'action', 'actions')}</span></button>
							{/if}
						</span>
						<!-- One More menu holds the core's actions (add under it, queue,
						     assign, delete). -->
						<span class="justify-self-end">
							<RowMenu
								label="Core actions"
								assigneeId={assigneeOf(coreTarget)}
								{collaborators}
								onAssign={(id) => store.assignWorkItem(coreTarget, id)}
								onRename={() => void renameCore(core)}
								core={{
									onAddFeature: () => {
										store.addFeatureToCore(core.id, "Feature");
										openCores[core.id] = true;
									},
									onAddFamily: () => {
										// Opened at once, so its First feature button is the next thing seen.
										openFamilies[store.addFamilyToCore(core.id, { name: "New family" })] = true;
										openCores[core.id] = true;
									},
									onDelete: () => void deleteCore(core),
									canDelete: coreEmpty,
								}}
							/>
						</span>
					</div>
					{#if coreOpen}
					<!-- Feature/family list, indented under the core's name. Re-homing to the
			     core root is handled by the whole row (see the outer drop target
			     above), so this is a plain container. -->
					<div class="pb-4 pl-[3.25rem] pr-5">
					<div role="list" class="@container space-y-2">
						{#each features as feat (feat.id)}
							{@render featureRow(feat, coreMatched)}
						{/each}
						{#each families as family (family.id)}
							{@render renderFamily(family, coreMatched)}
						{/each}
					</div>

					{#if coreEmpty}
						<button
							type="button"
							onclick={() =>
								store.addFeatureToCore(core.id, "Feature")}
							class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-line px-2 py-2 text-xs font-medium {style.text} hover:border-current"
						>
							<Icon name="plus" size={12} /> First feature
						</button>
					{/if}
					</div>
					{/if}
				</div>
			{/if}
		{/each}
		</div>
	</div>

	{#if searching && matchCount === 0}
		<p class="py-10 text-center text-sm text-ink-500">
			Nothing in the tree matches the search and filters.
		</p>
	{/if}

</div>

{#snippet featureRow(feat: Feature, inherited = false)}
	{@const featureAdvice = adviceByFeature.get(feat.id)}
	{@const isSelected = store.selectedFeatureId === feat.id}
	{@const actions = visibleActions(feat.id, inherited)}
	<!-- A query that hits one of the actions unfolds the row when it starts
	     (see unfoldToHits), and the chevron still folds it. -->
	{@const isExpanded = !!expanded[feat.id]}
	{@const featTarget = { kind: "feature", featureId: feat.id } as WorkTarget}
	{@const manualStage = store.getLeafMeta(feat.id).stage ?? null}
	{@const featureRules = placedRules.get(feat.id) ?? null}
	{@const unfoldable = actions.length > 0 || !!featureRules}
	<div
		role="listitem"
		data-anchor={feat.id}
		draggable="true"
		ondragstart={(e) => startDrag(e, feat.id)}
		ondragend={endDrag}
		ondragover={(e) => over(e, `feat:${feat.id}`, true)}
		ondragleave={() => leave(`feat:${feat.id}`)}
		ondrop={(e) => dropOnFeature(e, feat.id)}
		class="rounded-field border text-sm transition-[background-color,border-color,box-shadow,opacity] {style.feature} {dragId ===
		feat.id
			? 'opacity-40'
			: ''} {overZone === `feat:${feat.id}`
			? 'ring-2 ring-brand-400'
			: isSelected
				? 'ring-2 ring-brand-300'
				: ''}"
	>
		<!-- One line when the list is wide; below 42rem the name keeps the first
	     line whole and the badges and controls wrap under it, indented to the
	     name, still in their fixed slots so the rows stay aligned. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the chevron is the keyboard path; the row is a larger mouse target for it) -->
		<div
			onclick={(e) => unfoldable && toggleFromRow(e, () => toggleExpand(feat.id))}
			class="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 @2xl:flex-nowrap {unfoldable
				? FOLD_ROW
				: ''}"
		>
			{#if unfoldable}
				<button
					type="button"
					data-fold
					onclick={(e) => {
						e.stopPropagation();
						toggleExpand(feat.id);
					}}
					class="grid size-4 shrink-0 place-items-center {FOLD_CHEVRON}"
					aria-expanded={isExpanded}
					aria-label={isExpanded ? "Fold the feature" : "Unfold the feature"}
				>
					<Icon
						name="chevron-right"
						size={12}
						class="transition-transform {isExpanded
							? 'rotate-90'
							: ''}"
					/>
				</button>
			{:else}
				<span class="size-4 shrink-0"></span>
			{/if}
			<!-- No glyph before the name, and the name opens the details (spec: criterion
			     359aedf2): it is renamed from the row menu. The whole row stays draggable. -->
			<!-- The button is as wide as the name, so the rest of the row folds and
			     unfolds it (spec: criterion 3b3ad8ae). -->
			<span class="flex min-w-12 flex-1 basis-[calc(100%-5rem)] @2xl:basis-auto">
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						store.selectFeature(feat.id);
					}}
					title="Open details"
					class="min-w-0 cursor-pointer truncate text-left text-sm {feat.name
						? 'text-ink-900'
						: 'italic text-ink-400'} hover:text-brand-600 hover:underline"
				>
					{feat.name || "Unnamed feature"}
				</button>
			</span>
			<!-- Badges and controls: on a narrow list one block under the name
		     (indented to it), on a wide one `contents`, so each slot stays a
		     column of the row itself and the rows line up. -->
			<div
				class="order-2 flex basis-full flex-wrap items-center gap-x-2 gap-y-1.5 @sm:pl-[2.6rem] @2xl:contents"
			>
				<!-- Fixed slots, the badge set at the start of each: every row puts its
		     maturity in the same column, whatever
		     the width of the words inside. The slots size on the list's own width
		     (@container), narrower in a narrow card so a row never overflows it, and
		     at their natural width on a phone-sized list, where no column is drawn. -->
				<!-- `group/maturity`: hovering the slot (the picker sits over the badge)
				     opens the badge's maturity card. -->
				<span
					class="group/maturity relative flex shrink-0 items-center justify-end @md:w-20 @xl:w-24"
				>
					<AdvisorBadge
						summary={featureAdvice?.summary ?? null}
						score={featureAdvice?.score ?? null}
						gaps={featureAdvice?.gaps ?? []}
						{manualStage}
						fallbackPercentage={maturity.get(feat.id) ?? null}
					/>
					<!-- Invisible native picker overlaid on the badge: click the badge to set
			     the stage by hand (or back to Auto = engine-computed). -->
					<select
						value={manualStage == null
							? ""
							: clampStageLevel(manualStage)}
						onchange={(e) =>
							store.setLeafStage(
								feat.id,
								e.currentTarget.value === ""
									? null
									: Number(e.currentTarget.value),
							)}
						aria-label="Set feature spec maturity"
						class="absolute inset-0 cursor-pointer opacity-0"
					>
						<option value="">Auto (computed)</option>
						{#each MATURITY_STAGES as s (s.level)}<option
								value={s.level}
								>{s.level}/{MATURITY_STAGE_COUNT} · {s.label}</option
							>{/each}
					</select>
				</span>
				<!-- No implementation chip on the feature row (spec: criterion 3a3654df): the
		     share of code located reads per action, and the feature's total in its stats. -->
			</div>
			<!-- Everything not vital on the row lives in its More menu (the name itself
			     opens the details). On a narrow list it stays on the first line. -->
			<span class="order-1 flex shrink-0 items-center gap-1 @2xl:order-none">
				{#if overview}
					<!-- Opened from Statistics in the row menu; no icon of its own. -->
					<StatsButton
						{overview}
						{implementation}
						featureId={feat.id}
						title="Behavior of {feat.name || 'this feature'}"
						trigger={false}
						bind:open={() => statsOpen[feat.id] ?? false, (v) => (statsOpen[feat.id] = v)}
					/>
				{/if}
				<RowMenu
					label="Feature actions"
					onDetails={() => store.selectFeature(feat.id)}
					onRename={() => void renameFeature(feat)}
					onAddAction={() => void addAction(feat)}
					onStats={overview ? () => (statsOpen[feat.id] = true) : undefined}
					rules={featureRules && featureRules.count > 0
						? { count: featureRules.count, shown: allRules.has(feat.id), onToggle: () => toggleAllRules(feat.id) }
						: null}
					assigneeId={assigneeOf(featTarget)}
					{collaborators}
					onAssign={(id) => store.assignWorkItem(featTarget, id)}
					contributors={{
						selectedIds: store.getFeatureContributors(feat.id),
						onToggle: (personId) => store.toggleFeatureContributor(feat.id, personId),
					}}
					feature={{
						canDelete: actionsOf(feat.id).length === 0,
						onDelete: () => void deleteFeature(feat),
					}}
				/>
			</span>
		</div>

		{#if actionsOf(feat.id).length === 0 && !searching}
			<!-- A feature is what a user can do, so its first action is the next
			     step: offered on the row itself rather than hidden in the menu. -->
			<div class="px-3 pb-2 pl-9">
				<button
					type="button"
					onclick={() => void addAction(feat)}
					class="flex w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-line px-2 py-1.5 text-xs font-medium {style.text} hover:border-current"
				>
					<Icon name="plus" size={12} /> First action
				</button>
			</div>
		{/if}

		{#if isExpanded && unfoldable}
			<!-- What a user can actually do in this feature, each hand-able to a
			     member, then what holds beyond one action. Indented so each
			     action's chevron sits under the feature's bolt. -->
			<div class="space-y-1 border-t border-line/70 py-2 pl-9 pr-3">
				{#each actions as action (action.id)}
					{@const own = rulesOfAction(feat.id, action)}
					{@render actionRow(feat.id, action, own)}
					{#if own && (allRules.has(feat.id) || openRules.has(actionRulesKey(feat.id, action)))}
						<div class="pl-6">
							{@render ruleBox(own.rules, own.refusalLead, true)}
						</div>
					{/if}
				{/each}
				{#if featureRules && featureRules.count > 0}
					{@const showAll = allRules.has(feat.id)}
					<!-- Shown from Show all rules in the feature's row menu (spec: 47d47d45). -->
					{#if showAll}
						{#each featureRules.surfaces.filter((sf) => sf.own.length > 0) as surface (surface.surfaceId)}
							<p class="pt-2 text-xs font-semibold text-ink-800">
								On the whole surface
								<span class="font-normal text-ink-400">· {surface.surfaceName}</span>
							</p>
							{@render ruleBox(surface.own, null, false)}
						{/each}
						{#if featureRules.featureWide.length > 0}
							<p class="pt-2 text-xs font-semibold text-ink-800">Across the whole feature</p>
							{@render ruleBox(featureRules.featureWide, null, false)}
						{/if}
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet ruleBox(rules: ActionRules["rules"], refusalLead: string | null, underAction: boolean)}
	<div class="mb-1 overflow-hidden rounded-field border border-line bg-surface-card py-1">
		<KernelRuleLines
			{rules}
			{refusalLead}
			{underAction}
			{onOpenEditor}
		/>
	</div>
{/snippet}

{#snippet actionRow(featureId: string, action: FeatureAction, own: ActionRules | null)}
	{@const actionName = readableName(action.name)}
	{@const rulesKey = actionRulesKey(featureId, action)}
	{@const rulesOpen = allRules.has(featureId) || openRules.has(rulesKey)}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the chevron is the keyboard path; the row is a larger mouse target for it) -->
	<div
		onclick={(e) => own && toggleFromRow(e, () => toggleRules(rulesKey))}
		class="group/act flex items-center gap-2 rounded-field py-1 hover:bg-surface/70 {own
			? FOLD_ROW
			: ''}"
	>
		<!-- A chevron only where there are rules to read: it says so without a count. -->
		{#if own}
			<button
				type="button"
				data-fold
				onclick={() => toggleRules(rulesKey)}
				class="grid size-4 shrink-0 place-items-center {FOLD_CHEVRON}"
				aria-expanded={rulesOpen}
				aria-label={rulesOpen
					? `Hide the rules of ${actionName}`
					: `Show the rules of ${actionName}`}
			>
				<Icon
					name="chevron-right"
					size={12}
					class="transition-transform {rulesOpen ? 'rotate-90' : ''}"
				/>
			</button>
		{:else}
			<span class="size-4 shrink-0"></span>
		{/if}
		<!-- The name opens the action's details; the action's card opens on its code icon. -->
		<span class="flex min-w-0 flex-1">
			{#if onOpenAction || onOpenEditor}
				<button
					type="button"
					onclick={() =>
						onOpenAction
							? onOpenAction(featureId, action.id)
							: onOpenEditor?.(actionPath(featureId, action))}
					class="min-w-0 cursor-pointer truncate text-left text-xs text-ink-700 hover:text-brand-600 hover:underline"
				>
					{actionName}
				</button>
			{:else}
				<span class="min-w-0 truncate text-xs text-ink-700">{actionName}</span>
			{/if}
		</span>
		<!-- No maturity on an action row (spec: criterion e3c422dd): the feature row sums it
		     up. The row carries its code instead, 0% when nothing of it is mapped. Hovering
		     that icon, and nothing else on the row, opens the action's card (spec: criterion
		     d42a090d); where it happens reads there, the word "surface" never reaches the screen. -->
		<span class="group/action relative">
			<ImplementationBadge
				coverage={implementation.get(featureId)?.actions?.[action.id]}
				zeroWhenAbsent
				noTooltip
			/>
			<ActionHoverCard
				name={actionName}
				intent={action.intent}
				surfaceName={action.surfaceName}
				rules={own?.rules ?? []}
				coverage={implementation.get(featureId)?.actions?.[action.id]}
				opensDetails={!!(onOpenAction || onOpenEditor)}
			/>
		</span>
		<!-- An action's menu holds Rename and Delete and nothing else (spec: ac-tree-row-menu). -->
		<RowMenu
			label="Actions on this action"
			onRename={() => void renameAction(featureId, action)}
			onDeleteAction={() => void deleteAction(featureId, action)}
		/>
	</div>
{/snippet}

{#snippet renderFamily(family: Family, inherited = false)}
	{@const familyMatched =
		inherited || matchesQuery(search, family.name, family.description)}
	{@const familyFeatures = keepFeatures(
		featuresDirectlyUnderFamily(store.draft, family.id),
		familyMatched,
	)}
	{@const childFamilies = keepFamilies(
		subFamiliesOf(store.draft, family.id),
		familyMatched,
	)}
	<!-- A search unfolds the families on its path once (unfoldToHits); the chevron still folds them. -->
	{@const isOpen = !!openFamilies[family.id]}
	{@const familyLeaves = featuresUnderFamily(family.id)}
	{@const familyActions = familyLeaves.reduce((n, f) => n + actionsOf(f.id).length, 0)}
	<div
		role="group"
		data-anchor={family.id}
		ondragover={(e) => over(e, `fam:${family.id}`, true)}
		ondragleave={() => leave(`fam:${family.id}`)}
		ondrop={(e) => dropOnFamily(e, family)}
		class="rounded-field border bg-surface-sunken/60 p-2 transition-[border-color,box-shadow] {overZone ===
		`fam:${family.id}`
			? 'border-brand-300 ring-2 ring-brand-300'
			: 'border-line'}"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the chevron is the keyboard path; the row is a larger mouse target for it) -->
		<div
			onclick={(e) => toggleFromRow(e, () => toggleFamily(family.id))}
			class="{FOLD_ROW} flex items-center gap-2"
		>
			<button
				type="button"
				data-fold
				onclick={() => toggleFamily(family.id)}
				class="grid size-4 shrink-0 place-items-center {FOLD_CHEVRON}"
				aria-label={isOpen ? "Collapse family" : "Expand family"}
			>
				<Icon
					name="chevron-right"
					size={12}
					class="transition-transform {isOpen ? 'rotate-90' : ''}"
				/>
			</button>
			<Icon name="layers" size={13} />
			<span
				class="min-w-0 flex-1 truncate text-xs font-semibold {family.name
					? 'text-ink-800'
					: 'italic text-ink-400'}"
			>
				{family.name || "Unnamed family"}
			</span>
			<!-- The same counters as a folded core, for everything under the family. -->
			{#if !isOpen}
			<span class="shrink-0 text-[0.6875rem] tabular-nums text-ink-400">
				<button
					type="button"
					onclick={() => openToCount({ familyId: family.id }, false)}
					title="Show its features"
					class="cursor-pointer hover:text-brand-600 hover:underline"
				>
					<span class="font-semibold text-ink-700">{familyLeaves.length}</span>
					{word(familyLeaves.length, "feature", "features")}
				</button>
				<span class="px-1 text-ink-300" aria-hidden="true">·</span>
				<button
					type="button"
					onclick={() => openToCount({ familyId: family.id }, true)}
					title="Show its features with their actions"
					class="cursor-pointer hover:text-brand-600 hover:underline"
				>
					<span class="font-semibold text-ink-700">{familyActions}</span>
					{word(familyActions, "action", "actions")}
				</button>
			</span>
			{/if}

			<div class="relative shrink-0">
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						toggleMenu(`fam:${family.id}`);
					}}
					class="rounded p-0.5 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
					aria-label="Family actions"
				>
					<Icon name="ellipsis" size={14} />
				</button>
				{#if openMenu === `fam:${family.id}`}
					<div use:floatInView={{ align: 'right' }}
						class="min-w-40 rounded-lg border border-line bg-surface py-1 shadow-card"
						role="menu"
					>
						<button
							type="button"
							onclick={() => {
								openMenu = null;
								void renameFamily(family);
							}}
							class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-sunken"
						>
							<Icon name="pencil" size={12} class="text-ink-500" /> Rename
						</button>
						<button
							type="button"
							onclick={() => {
								store.addFeatureToFamily(family.id, "Feature");
								openFamilies[family.id] = true;
								openMenu = null;
							}}
							class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-sunken"
						>
							<Icon
								name="sparkles"
								size={12}
								class="text-brand-500"
							/> Add feature
						</button>
						<button
							type="button"
							onclick={() => {
								const child = store.addSubFamily(family.id, {
									name: "New sub-family",
								});
								openFamilies[family.id] = true;
								openFamilies[child] = true;
								openMenu = null;
							}}
							class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-sunken"
						>
							<Icon
								name="layers"
								size={12}
								class="text-ink-500"
							/> Add family
						</button>
						<div class="my-1 border-t border-line"></div>
						{#if featuresDirectlyUnderFamily(store.draft, family.id).length === 0 && subFamiliesOf(store.draft, family.id).length === 0}
							<button
								type="button"
								onclick={() => {
									openMenu = null;
									void deleteFamily(family);
								}}
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger-500 hover:bg-danger-50"
							>
								<Icon name="x" size={12} /> Delete
							</button>
						{:else}
							<div
								class="flex items-start gap-2 px-3 py-1.5 text-[0.6875rem] text-ink-400"
								title="Empty the family first"
							>
								<Icon name="lock" size={12} />
								<span>Delete locked - not empty</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		{#if isOpen}
			<div class="mt-2 space-y-1.5 pl-3">
				{#each familyFeatures as feat (feat.id)}
					{@render featureRow(feat, familyMatched)}
				{/each}

				{#if familyFeatures.length === 0 && childFamilies.length === 0 && !searching}
					<button
						type="button"
						onclick={() => store.addFeatureToFamily(family.id, "Feature")}
						class="flex w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-line px-2 py-1.5 text-xs font-medium {style.text} hover:border-current"
					>
						<Icon name="plus" size={12} /> First feature
					</button>
				{/if}

				{#each childFamilies as child (child.id)}
					{@render renderFamily(child, familyMatched)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}
