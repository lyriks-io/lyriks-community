<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import { DECISION_AREAS, type DecisionArea } from '$domain/supervision';
	import type { SupervisionStore } from '../draft-store.svelte';

	interface Props {
		store: SupervisionStore;
	}
	let { store }: Props = $props();

	let adding = $state(false);
	let form = $state<{ title: string; rationale: string; area: DecisionArea; by: string }>({
		title: '',
		rationale: '',
		area: 'feature',
		by: ''
	});

	const areaLabel = (code: DecisionArea) =>
		DECISION_AREAS.find((a) => a.code === code)?.label ?? code;

	function submit() {
		if (store.logDecision(form)) {
			form = { title: '', rationale: '', area: 'feature', by: '' };
			adding = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-3">
		<p class="text-xs text-ink-500">
			Every non-obvious call, captured with its rationale and the area it touches - so a reviewer (or a
			future takeover) can retrace why the spec is the way it is.
		</p>
		<Button variant="outline" size="sm" onclick={() => (adding = !adding)}>
			<Icon name="plus" size={14} /> Log decision
		</Button>
	</div>

	{#if adding}
		<div class="space-y-2 rounded-card border border-brand-200 bg-brand-50/40 p-3">
			<div class="grid gap-2 sm:grid-cols-2">
				<input
					bind:value={form.title}
					placeholder="What was decided"
					class="rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				/>
				<input
					bind:value={form.by}
					placeholder="Decided by"
					class="rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				/>
			</div>
			<input
				bind:value={form.rationale}
				placeholder="Why - the rationale"
				class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 outline-none"
			/>
			<div class="flex items-center gap-2">
				<select
					bind:value={form.area}
					class="rounded-field border border-line bg-surface px-2 py-1.5 text-sm text-ink-700 outline-none"
				>
					{#each DECISION_AREAS as a (a.code)}
						<option value={a.code}>{a.label}</option>
					{/each}
				</select>
				<Button variant="primary" size="sm" onclick={submit}>Log</Button>
				<button type="button" class="text-xs text-ink-500 hover:text-ink-800" onclick={() => (adding = false)}
					>Cancel</button
				>
			</div>
		</div>
	{/if}

	{#if store.draft.decisions.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
			<p class="text-sm font-semibold text-ink-700">No decisions logged yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Record the key calls as you make them - the canonical term chosen, the PSP picked, the scope cut.
			</p>
		</div>
	{:else}
		<div class="relative space-y-3 pl-4 before:absolute before:bottom-1 before:left-1 before:top-1 before:w-px before:bg-line">
			{#each store.draft.decisions as d (d.id)}
				<div class="relative">
					<span class="absolute -left-[13px] top-2 size-2 rounded-full bg-brand-500 ring-2 ring-surface"></span>
					<article class="rounded-card border border-line bg-surface p-3">
						<div class="flex items-center gap-2">
							<span class="text-[13px] font-semibold text-ink-800">{d.title}</span>
							<span class="ml-auto text-[9px] font-bold uppercase tracking-[0.1em] text-brand-600"
								>{areaLabel(d.area)}</span
							>
							<button
								type="button"
								onclick={() => store.removeDecision(d.id)}
								class="text-ink-300 hover:text-danger-500"
								aria-label="Remove"><Icon name="x" size={14} /></button
							>
						</div>
						{#if d.rationale}<p class="mt-0.5 text-[11px] leading-snug text-ink-600">{d.rationale}</p>{/if}
						<p class="mt-1 text-[10px] text-ink-400">
							{#if d.by}{d.by} · {/if}{d.when}
						</p>
					</article>
				</div>
			{/each}
		</div>
	{/if}
</div>
