<script lang="ts">
	import { Button, Icon, type Filter } from '$ui/design-system';
	import { inventoryRuleRow, type RuleRow } from '../rule-filter';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { RULE_CATEGORIES, RULE_SOURCES, type ConsolidatedRule, type RuleSource } from '$domain/rules';
	import type { RulesStore } from '../draft-store.svelte';

	interface Props {
		store: RulesStore;
		/** The Rules panel's filter, shared with the behavior rules above. */
		filter?: Filter<RuleRow> | null;
	}
	let { store, filter = null }: Props = $props();

	const catLabel = (c: string) => RULE_CATEGORIES.find((x) => x.code === c)?.label ?? c;

	// Where each rule kind is actually authored. The inventory is a read-only,
	// derived worklist (see rules-projection): Lyriks never edits these rules here,
	// it routes back to their owning Lyriks page — the "facet split" from the
	// platform review (§6.3). Definition rules/SLAs/security live in Foundation.
	const SOURCE_PAGE: Record<RuleSource, { page: string; label: string }> = {
		definition_rule: { page: 'foundation', label: 'Edit in Foundation' },
		sla: { page: 'foundation', label: 'Edit in Foundation' },
		security: { page: 'foundation', label: 'Edit in Foundation' },
		permission: { page: 'users', label: 'Edit in Users & Permissions' },
		journey: { page: 'experience', label: 'Edit in Experience' }
	};
	const sourceHref = (source: string) => {
		const dest = SOURCE_PAGE[source as RuleSource];
		return dest ? `/projects/${store.draft.projectId}/${dest.page}` : null;
	};
	const sourceLinkLabel = (source: string) =>
		SOURCE_PAGE[source as RuleSource]?.label ?? 'Edit at source';

	/* Search matches the whole rule as it reads on screen: its label, its
	   statement, and the category/source chips beside it, so "mandatory
	   permission" narrows to exactly the rows carrying both words. */
	const visible = $derived(
		store.draft.inventory.filter((r) => !filter || filter.matches(inventoryRuleRow(r)))
	);

	// Group the inventory by source so the reader sees where each rule came from.
	const groups = $derived.by(() => {
		const by = new Map<string, ConsolidatedRule[]>();
		for (const r of visible) {
			const list = by.get(r.source) ?? [];
			list.push(r);
			by.set(r.source, list);
		}
		return RULE_SOURCES.map((s) => ({ source: s.code, label: s.label, rules: by.get(s.code) ?? [] })).filter(
			(g) => g.rules.length > 0
		);
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-3">
		<p class="text-xs text-ink-500">
			Every rule and constraint you've already declared, pulled together read-only. This is the
			corpus the Issues tab is checked against. Authored in Steps 02, 03 and 05 - edit it there.
		</p>
		<Button variant="outline" size="sm" onclick={store.refreshInventory}>
			<Icon name="rotate" size={14} /> Refresh
		</Button>
	</div>

	{#if store.draft.inventory.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
			<p class="text-sm font-semibold text-ink-700">Nothing declared upstream yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Add business rules in Foundation, permissions in Users, or journeys in Experience - then
				<strong>Refresh</strong>.
			</p>
		</div>
	{:else if visible.length === 0}
		<p class="px-1 py-8 text-center text-sm text-ink-500">No rule matches the filter.</p>
	{:else}
		{#each groups as group (group.source)}
			<section class="rounded-card border border-line bg-surface">
				<header class="flex items-center gap-2 border-b border-line px-4 py-2.5">
					<span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{group.label}
					</span>
					<span class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-ink-500">
						{group.rules.length}
					</span>
					{#if sourceHref(group.source)}
						<a
							href={sourceHref(group.source)}
							class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:text-brand-600 hover:underline"
						>
							{sourceLinkLabel(group.source)} <Icon name="arrow-right" size={12} />
						</a>
					{/if}
				</header>
				<ul class="divide-y divide-line">
					{#each group.rules as rule (rule.id)}
						<li data-anchor={rule.id} class="flex items-start gap-3 px-4 py-2.5">
							<span
								class="mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-medium {rule.category ===
								'permissions'
									? 'bg-info-50 text-info-600'
									: rule.category === 'validation'
										? 'bg-warning-50 text-warning-600'
										: 'bg-brand-50 text-brand-600'}"
							>
								{catLabel(rule.category)}
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-ink-800">
									<GlossaryText text={rule.label} />
								</p>
								<p class="text-xs text-ink-500"><GlossaryText text={rule.statement} /></p>
							</div>
							{#if rule.mandatory}
								<span class="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-danger-500"
									>Mandatory</span
								>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>
