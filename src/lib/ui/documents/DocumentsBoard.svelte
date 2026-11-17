<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import { tick } from 'svelte';
	import SourceMetadata from './SourceMetadata.svelte';
	import { Button, FilterBar, Icon } from '$ui/design-system';
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

	const fieldBox = 'flex flex-col gap-1';
	const labelClass = 'text-xs font-semibold text-ink-700';
	const hintClass = 'text-xs text-ink-500';
	const inputClass =
		'w-full min-w-0 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-300';

	// The content box is as tall as its text, so it is read whole without an
	// inner scrollbar; it follows every edit and every resize of the page.
	function fitContent(node: HTMLTextAreaElement, _value: string) {
		const fit = () => {
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight + 2}px`;
		};
		// Only a new width re-wraps the text; reacting to its own height would loop.
		let width = node.clientWidth;
		const ro = new ResizeObserver(() => {
			if (node.clientWidth === width) return;
			width = node.clientWidth;
			fit();
		});
		ro.observe(node);
		fit();
		return { update: fit, destroy: () => ro.disconnect() };
	}
	async function addSource() {
		store.clearFilter();
		const id = store.addSource();
		await tick();
		const el = titleInputs[id];
		el?.scrollIntoView({ block: 'center', behavior: scrollMotion() });
		el?.focus();
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<!-- The same toolbar as every other list (spec criterion 05c85445). -->
		<FilterBar
			filter={store.filter}
			items={store.draft.sources}
			visibleCount={store.filtered.length}
			size="md"
			class="min-w-0 flex-1"
		/>
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
		<p class="px-1 py-8 text-center text-sm text-ink-500">No source matches the filter.</p>
	{:else}
		<ul class="space-y-3">
			{#each store.filtered as s (s.id)}
				{@const href = sourceHref(s)}
				{@const access = sourceAccess(s)}
				<li class="rounded-card border border-line bg-surface p-4">
					<div class="flex items-start gap-2">
						<!-- Every field says what it is for (spec criterion 1670ca2f): a bare
						     placeholder disappears the moment something is typed. -->
						<div class="min-w-0 flex-1 space-y-3">
							<div class="grid gap-3 sm:grid-cols-[1fr_14rem]">
								<label class={fieldBox}>
									<span class={labelClass}>Name</span>
									<input
										bind:this={titleInputs[s.id]}
										value={s.title}
										oninput={(e) => store.updateSource(s.id, { title: e.currentTarget.value })}
										placeholder="e.g. GDPR Art. 17, Ops lead interview"
										class="{inputClass} font-medium text-ink-900"
									/>
									<span class={hintClass}>What every citation of this source shows.</span>
								</label>
								<label class={fieldBox}>
									<span class={labelClass}>Kind</span>
									<select
										value={s.kind}
										onchange={(e) => store.setKind(s.id, e.currentTarget.value as DocumentKind)}
										class={inputClass}
									>
										{#each DOCUMENT_KINDS as k (k.code)}
											<option value={k.code}>{k.label}</option>
										{/each}
									</select>
									<span class={hintClass}>What sort of evidence it is.</span>
								</label>
							</div>
							<div class={fieldBox}>
								<label for="source-url-{s.id}" class={labelClass}>Address</label>
								<div class="flex items-center gap-2">
									<input
										id="source-url-{s.id}"
										value={s.url}
										oninput={(e) => store.updateSource(s.id, { url: e.currentTarget.value })}
										placeholder="https://…"
										class={inputClass}
									/>
									{#if href}
										<a
											{href}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex shrink-0 items-center gap-1 rounded-field border border-line px-2.5 py-2 text-xs font-medium text-brand-600 hover:bg-surface-sunken"
										>
											Open <Icon name="external-link" size={12} />
										</a>
									{/if}
								</div>
								<span class={hintClass}>
									A link anyone on the team can open. Leave it empty when the evidence is the content
									below.
								</span>
								{#if access === 'unreachable'}
									<!-- A reference nobody else can open looks sourced and is not: say so
									     here, where the fix is one field away, instead of at the gate. -->
									<p class="text-xs text-warning-700">
										Nobody else can open this reference. Give a web address, or clear it and put
										what you used in the content (keep the local path there as provenance).
									</p>
								{/if}
							</div>
							<label class={fieldBox}>
								<span class={labelClass}>Content</span>
								<textarea
									value={s.note}
									oninput={(e) => store.updateSource(s.id, { note: e.currentTarget.value })}
									rows="4"
									use:fitContent={s.note}
									placeholder="The words the claim rests on: an excerpt, interview notes, a figure and where it comes from…"
									class="{inputClass} resize-none overflow-hidden text-sm leading-relaxed text-ink-800"
								></textarea>
								<span class={hintClass}>
									Its first sentence is what people read when they hover a citation; a click shows all of it.
								</span>
							</label>
							<SourceMetadata source={s} update={(patch) => store.updateSource(s.id, patch)} />
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
