<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { fieldsOfEntity, type DataVisibilityChoice } from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import { VISIBILITY_HEX, VISIBILITY_LABEL, visibilityStatus } from './data-map';

	/**
	 * What of one table reaches a client (feature feat-data-model, "Decide what a
	 * client may see"). Following the screens is the default; a person may force a
	 * table or a field on or off. Data is never deleted here, only hidden.
	 */
	interface Props {
		store: DataStore;
		entityId: string;
		surfaced: ReadonlySet<string>;
	}
	let { store, entityId, surfaced }: Props = $props();

	const entity = $derived(store.draft.entities.find((e) => e.id === entityId));
	const rows = $derived(
		entity
			? [
					{ id: entity.id, label: 'The whole table', isTable: true },
					...fieldsOfEntity(store.draft, entity.id).map((f) => ({
						id: f.id,
						label: f.name || 'field',
						isTable: false
					}))
				]
			: []
	);

	function setChoice(id: string, value: string) {
		store.setVisibilityChoice(id, value === 'follow' ? null : (value as DataVisibilityChoice));
	}
</script>

{#if entity}
	<div class="space-y-1.5">
		<p class="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Client visibility</p>
		<p class="text-[0.6875rem] text-ink-400">
			Follows what the screens show unless you force it. Anything that left without a decision is flagged.
		</p>
		<ul class="divide-y divide-line rounded-field border border-line bg-surface">
			{#each rows as r (r.id)}
				{@const status = visibilityStatus(store.draft, surfaced, r.id)}
				<li class="flex items-center gap-2 px-2 py-1 text-[0.6875rem]">
					<span class="size-2 shrink-0 " style="background:{VISIBILITY_HEX[status]}" title={VISIBILITY_LABEL[status]}></span>
					<span class="min-w-0 flex-1 truncate {r.isTable ? 'font-semibold text-ink-800' : 'font-mono text-ink-700'}">{r.label}</span>
					{#if status === 'anomaly'}
						<Icon name="flag" size={11} class="text-warning-600" />
					{/if}
					<select
						value={store.getVisibilityChoice(r.id) ?? 'follow'}
						onchange={(e) => setChoice(r.id, e.currentTarget.value)}
						aria-label="Client visibility of {r.label}"
						class="rounded-field border border-line bg-surface px-1 py-0.5 text-[0.625rem] text-ink-600"
					>
						<option value="follow">Follow screens</option>
						<option value="shown">Always show</option>
						<option value="hidden">Never show</option>
					</select>
				</li>
			{/each}
		</ul>
	</div>
{/if}
