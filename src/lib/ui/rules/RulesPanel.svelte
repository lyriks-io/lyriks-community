<script lang="ts">
	import type { RulesStore } from './draft-store.svelte';
	import type { KernelRulesReadModel } from '$application/index-feature-rules';
	import type { RulesTab } from '$domain/rules';
	import { FilterBar } from '$ui/design-system';
	import {
		createEdgeCaseFilter,
		createRulesFilter,
		inventoryRuleRow,
		kernelRuleRow,
		type RuleRow
	} from './rule-filter';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import RuleInventory from './sections/RuleInventory.svelte';
	import KernelRules from './sections/KernelRules.svelte';
	import EdgeCases from './sections/EdgeCases.svelte';

	interface Props {
		store: RulesStore;
		/** Read-only rules folded from the behavior kernel (never round-trips into residue). */
		kernelRules: KernelRulesReadModel;
		dashboardProjectId: string | null;
		/** Opens the Behavior tab's EMBEDDED editor on `path` (null = the project). */
		onOpenEditor: (path?: string | null) => void;
	}
	let { store, kernelRules, dashboardProjectId, onOpenEditor }: Props = $props();

	/* One filter per tab, owned here rather than by each section: the Rules tab
	   stacks TWO lists (kernel rules + the consolidated inventory) and a reader
	   looking for "refund" wants both narrowed by one toolbar, not two. Both
	   lists are projected onto the shared `RuleRow` so a single Filter drives
	   them. Switching tabs resets it: a query typed against rules would silently
	   hide most of the edge cases. */
	const rulesFilter = createRulesFilter();
	const edgeFilter = createEdgeCaseFilter();
	function switchTab(id: RulesTab) {
		rulesFilter.clear();
		edgeFilter.clear();
		store.switchTab(id);
	}

	/* The unfiltered corpus, which the toolbar needs to derive its facet options
	   and per-option counts. `originOf` mirrors the wording KernelRules puts on
	   screen, so a facet never names a place the list does not. */
	const originOf = (rule: KernelRulesReadModel['groups'][number]['rules'][number]): string => {
		const o = rule.origin;
		if (o.kind === 'action') return `${o.surfaceName} ${o.actionName}`;
		if (o.kind === 'surface') return `${o.surfaceName} surface`;
		if (o.kind === 'feature') return 'Feature-wide';
		return 'Project-wide';
	};
	const ruleRows = $derived<RuleRow[]>([
		...kernelRules.groups.flatMap((g) => g.rules.map((r) => kernelRuleRow(r, originOf(r)))),
		...store.draft.inventory.map(inventoryRuleRow)
	]);
	const visibleRuleCount = $derived(rulesFilter.apply(ruleRows).length);
	const visibleEdgeCount = $derived(edgeFilter.apply(store.draft.scenarios).length);

	// Foundation's second-level nav (SectionNav), not a bespoke tab strip — issue
	// triage lives in the Control Center's coherence panel, so the two entries
	// here are purely about authoring.
	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'Rules & edge cases',
			items: [
				{
					id: 'inventory',
					label: 'Rules',
					hint: 'Everything declared so far',
					icon: 'layers',
					count: store.draft.inventory.length + kernelRules.total
				},
				{
					id: 'edge_cases',
					label: 'Edge cases',
					hint: 'What-if acceptance tests',
					icon: 'target',
					count: store.draft.scenarios.length
				}
			]
		}
	]);
</script>

<SectionNav
	groups={navGroups}
	active={store.activeTab}
	onSelect={(id) => switchTab(id as RulesTab)}
>
	<div class="space-y-5">
		{#if store.activeTab === 'inventory'}
			<FilterBar
				filter={rulesFilter}
				items={ruleRows}
				visibleCount={visibleRuleCount}
				size="md"
			/>
			<div class="space-y-8">
				<KernelRules
					model={kernelRules}
					{dashboardProjectId}
					{onOpenEditor}
					filter={rulesFilter}
				/>
				<RuleInventory {store} filter={rulesFilter} />
			</div>
		{:else}
			<FilterBar
				filter={edgeFilter}
				items={store.draft.scenarios}
				visibleCount={visibleEdgeCount}
				size="md"
			/>
			<EdgeCases {store} filter={edgeFilter} />
		{/if}
	</div>
</SectionNav>
