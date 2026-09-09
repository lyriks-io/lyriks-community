<script lang="ts">
	import { tick } from 'svelte';
	import { Button, Icon } from '$ui/design-system';
	import { DOCUMENT_KINDS, sourceAccess, sourceHref, type DocumentKind } from '$domain/documents';
	import type { DocumentsStore } from './draft-store.svelte';

	interface Props {
		store: DocumentsStore;
	}
	let { store }: Props = $props();

	// "Add source" appends to the bottom of a list that may be filtered or long,
	// so the button also takes you there: clear the filter that would hide the new
	// row, scroll it into view, and focus its title. Otherwise the click looks
	// like it did nothing — the failure every author hits once and never forgets.
	const titleInputs: Record<string, HTMLInputElement | null> = $state({});
	async function addSource() {
		store.setFilter('');
		const id = store.addSource();
		await tick();
		const el = titleInputs[id];
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		el?.focus();
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="relative w-full max-w-xs">
			<div class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-ink-400">
				<Icon name="search" size={14} />
			</div>
			<input
				value={store.filter}
				oninput={(e) => store.setFilter(e.currentTarget.value)}
				placeholder="Filter sources…"
				class="w-full rounded-pill border border-line bg-surface-sunken py-1.5 pl-8 pr-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-300"
			/>
		</div>
		<Button size="sm" onclick={addSource}>
			<Icon name="plus" size={14} /> Add source
		</Button>
	</div>

	{#if store.draft.sources.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
			<p class="text-sm font-semibold text-ink-700">No sources yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Add interviews, research, links, regulations or evidence, then cite them from features and
				requirements.
			</p>
		</div>
	{:else if store.filtered.length === 0}
		<p class="px-1 py-8 text-center text-sm text-ink-500">No sources match “{store.filter}”.</p>
	{:else}
		<ul class="space-y-3">
			{#each store.filtered as s (s.id)}
				{@const href = sourceHref(s)}
				{@const access = sourceAccess(s)}
				<li class="rounded-card border border-line bg-surface p-3">
					<div class="flex items-start gap-2">
						<div class="min-w-0 flex-1 space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<input
									bind:this={titleInputs[s.id]}
									value={s.title}
									oninput={(e) => store.updateSource(s.id, { title: e.currentTarget.value })}
									placeholder="Title"
									class="min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-300"
								/>
								<select
									value={s.kind}
									onchange={(e) => store.setKind(s.id, e.currentTarget.value as DocumentKind)}
									class="rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-300"
								>
									{#each DOCUMENT_KINDS as k (k.code)}
										<option value={k.code}>{k.label}</option>
									{/each}
								</select>
							</div>
							<div class="flex items-center gap-2">
								<input
									value={s.url}
									oninput={(e) => store.updateSource(s.id, { url: e.currentTarget.value })}
									placeholder="https://…  or a reference"
									class="min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
								/>
								{#if href}
									<a
										{href}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex shrink-0 items-center gap-1 rounded-field border border-line px-2 py-1.5 text-[11px] font-medium text-brand-600 hover:bg-surface-sunken"
									>
										Open <Icon name="external-link" size={12} />
									</a>
								{/if}
							</div>
							{#if access === 'unreachable'}
								<!-- A reference nobody else can open looks sourced and is not: say so
								     here, where the fix is one field away, instead of at the gate. -->
								<p class="text-[11px] text-warning-700">
									Nobody else can open this reference. Give a web address, or clear it and put
									what you used in the note (keep the local path there as provenance).
								</p>
							{/if}
							<textarea
								value={s.note}
								oninput={(e) => store.updateSource(s.id, { note: e.currentTarget.value })}
								rows="2"
								placeholder="Citation, excerpt, or why this matters…"
								class="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
							></textarea>
						</div>
						<button
							type="button"
							onclick={() => store.removeSource(s.id)}
							aria-label="Remove source"
							class="shrink-0 rounded p-1 text-ink-400 hover:bg-surface-sunken hover:text-danger-500"
						>
							<Icon name="x" size={14} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
