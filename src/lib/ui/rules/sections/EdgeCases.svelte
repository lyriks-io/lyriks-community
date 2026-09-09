<script lang="ts">
	import { Button, Icon, type Filter } from '$ui/design-system';
	import { EDGE_OUTCOMES, type EdgeCase, type EdgeOutcome } from '$domain/rules';
	import type { RulesStore } from '../draft-store.svelte';

	interface Props {
		store: RulesStore;
		/** The Rules panel's filter for this tab. */
		filter?: Filter<EdgeCase> | null;
	}
	let { store, filter = null }: Props = $props();

	const issueTitle = (id: string | null) =>
		id ? store.draft.issues.find((i) => i.id === id)?.title || 'gap' : null;

	// The coherence gaps a scenario can cover (missing rule / unhandled edge) —
	// they live in the Control Center; here they're only a link target so the
	// "uncovered gap" penalty is actionable. A stale link keeps its option so it
	// stays visible instead of silently rendering as unlinked.
	const coverableGaps = (currentId: string | null) =>
		store.draft.issues.filter(
			(i) => i.id === currentId || i.kind === 'missing_rule' || i.kind === 'unhandled_edge'
		);

	/* Search spans the whole Given/When/Then, not just the title: an author
	   hunting the scenario about a declined card usually remembers the "then",
	   not the name they gave it. */
	const visible = $derived(store.draft.scenarios.filter((ec) => !filter || filter.matches(ec)));
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-3">
		<p class="text-xs text-ink-500">
			Turn each risky “what if…” into a plain <strong class="text-ink-700">Given / When / Then</strong>
			scenario. These become the acceptance tests the generated product must pass - the place vague
			specs turn into checkable behavior.
		</p>
		<Button variant="outline" size="sm" onclick={() => store.addEdgeCase()}>
			<Icon name="plus" size={14} /> Edge case
		</Button>
	</div>

	{#if store.draft.scenarios.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
			<p class="text-sm font-semibold text-ink-700">No edge cases yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Add one to turn a risky “what if…” into a checkable acceptance test.
			</p>
		</div>
	{:else if visible.length === 0}
		<p class="px-1 py-8 text-center text-sm text-ink-500">No edge case matches the filter.</p>
	{:else}
		<div class="space-y-3">
			{#each visible as ec (ec.id)}
				<article data-anchor={ec.id} class="rounded-card border border-line bg-surface p-3.5">
					<div class="flex items-center gap-2">
						<span class="grid size-7 shrink-0 place-items-center rounded-lg bg-info-50 text-info-600">
							<Icon name="target" size={14} />
						</span>
						<input
							value={ec.title}
							oninput={(e) => store.updateEdgeCase(ec.id, 'title', e.currentTarget.value)}
							placeholder="Edge case - e.g. Stripe declines the card"
							class="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
						/>
						<label class="flex shrink-0 items-center gap-1 text-[11px] text-ink-400">
							<input type="checkbox" checked={ec.covered} onchange={() => store.toggleCovered(ec.id)} />
							covered
						</label>
						<button
							type="button"
							onclick={() => store.removeEdgeCase(ec.id)}
							class="shrink-0 text-ink-300 hover:text-danger-500"
							title="Remove"><Icon name="x" size={15} /></button
						>
					</div>

					<div class="mt-3 grid gap-2 sm:grid-cols-3">
						<label class="block">
							<span class="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Given</span>
							<input
								value={ec.given}
								oninput={(e) => store.updateEdgeCase(ec.id, 'given', e.currentTarget.value)}
								placeholder="the starting situation"
								class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none"
							/>
						</label>
						<label class="block">
							<span class="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">When</span>
							<input
								value={ec.whenText}
								oninput={(e) => store.updateEdgeCase(ec.id, 'whenText', e.currentTarget.value)}
								placeholder="the user does / this happens"
								class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none"
							/>
						</label>
						<label class="block">
							<span class="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Then</span>
							<input
								value={ec.then}
								oninput={(e) => store.updateEdgeCase(ec.id, 'then', e.currentTarget.value)}
								placeholder="the product should…"
								class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none"
							/>
						</label>
					</div>

					<div class="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
						<span class="font-semibold uppercase tracking-[0.1em] text-ink-400">Outcome</span>
						<select
							value={ec.expectedOutcome}
							onchange={(e) => store.setEdgeOutcome(ec.id, e.currentTarget.value as EdgeOutcome)}
							class="rounded-field border border-line bg-surface px-1.5 py-0.5 text-ink-600"
						>
							{#each EDGE_OUTCOMES as o (o.code)}
								<option value={o.code}>{o.label}</option>
							{/each}
						</select>
						<span class="font-semibold uppercase tracking-[0.1em] text-ink-400">Covers gap</span>
						<select
							value={ec.relatedIssueId ?? ''}
							onchange={(e) => store.linkEdgeToIssue(ec.id, e.currentTarget.value || null)}
							class="rounded-field border border-line bg-surface px-1.5 py-0.5 text-ink-600"
						>
							<option value="">- none -</option>
							{#each coverableGaps(ec.relatedIssueId) as issue (issue.id)}
								<option value={issue.id}>{issue.title || 'gap'}</option>
							{/each}
						</select>
						{#if issueTitle(ec.relatedIssueId)}
							<span class="text-ink-400">· {issueTitle(ec.relatedIssueId)}</span>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>
