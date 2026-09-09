<script lang="ts">
	import { tick } from 'svelte';
	import { Icon, openFileViewer } from '$ui/design-system';
	import {
		brokenCitations,
		citationCount,
		citedSources,
		DOCUMENT_KINDS,
		sourceHref,
		type DocumentKind,
		type DocumentSource
	} from '$domain/documents';
	import { getDocumentRegistry } from './registry.svelte';

	/**
	 * Cite evidence from the project Documents & Sources register.
	 *
	 * The ONE citation control in the app: features, foundation, users, rules,
	 * glossary and architecture all render this, so linked evidence looks and
	 * behaves the same everywhere and no context grows its own private list of
	 * links again.
	 *
	 * It reads the register from the project-wide `DocumentRegistry` rather than
	 * from props, which is what lets it also REGISTER a source in place: the
	 * common gesture is "I just read this, cite it here", and making that a trip
	 * to another page is what stops people sourcing anything.
	 */
	interface Props {
		/** Ids currently cited by the object being edited. */
		selected: readonly string[] | undefined;
		onToggle: (sourceId: string) => void;
		/** What this object is, for the copy ("this term", "this role"…). */
		subject?: string;
		/** Start with the picker expanded (a panel that is all about evidence). */
		open?: boolean;
	}
	let { selected, onToggle, subject = 'this item', open = false }: Props = $props();

	const registry = getDocumentRegistry();
	const sources = $derived(registry?.sources ?? []);

	const count = $derived(citationCount(selected, sources));
	// What IS cited, shown as chips OUTSIDE the picker — always, never behind a
	// disclosure. The citations are the answer to "where did this come from?", so
	// reading them must cost nothing; only choosing new ones is a deliberate act.
	const cited = $derived(citedSources(selected, sources));
	const broken = $derived(brokenCitations(selected, sources));

	// And a chip goes straight to the evidence. Inline files (data URLs) can't be
	// navigated to in a new tab — browsers block that — so they open the in-app
	// preview instead; everything else is a plain link.
	const isInlineFile = (source: DocumentSource) => source.url.trim().startsWith('data:');

	// A register grows past what a checkbox list can be scanned in, so it is
	// searchable here exactly as it is on the Documents page — over title, URL,
	// kind and note, so "gdpr" finds the regulation whatever it was titled.
	let query = $state('');
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return sources;
		return sources.filter((source) =>
			[source.title, source.url, source.kind, source.note].some((field) =>
				field.toLowerCase().includes(q)
			)
		);
	});
	// Never hide something already cited behind a filter — un-citing it would be
	// impossible without first clearing the search.
	const visible = $derived(
		query.trim()
			? [...matches, ...sources.filter((s) => (selected ?? []).includes(s.id) && !matches.includes(s))]
			: matches
	);

	// ── Register a source without leaving the page ──────────────────────────
	let adding = $state(false);
	let saving = $state(false);
	let title = $state('');
	let url = $state('');
	let kind = $state<DocumentKind>('link');
	let titleEl = $state<HTMLInputElement | null>(null);
	// The register appends, so a source added from a long list lands off-screen.
	// Scroll to it and tint it briefly — you must SEE what you just cited.
	const rowEls: Record<string, HTMLElement | null> = $state({});
	let justAdded = $state<string | null>(null);

	async function openForm() {
		adding = true;
		// Seed from whatever was typed in the search: you searched for it, it
		// wasn't there, so that IS the title you meant.
		title = query.trim();
		await tick();
		titleEl?.focus();
	}

	function closeForm() {
		adding = false;
		title = '';
		url = '';
		kind = 'link';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!registry || saving || !title.trim()) return;
		saving = true;
		try {
			const source = await registry.create({ title: title.trim(), url: url.trim(), kind });
			// Registered AND cited in one gesture — the whole point of doing it here.
			onToggle(source.id);
			query = '';
			closeForm();
			justAdded = source.id;
			await tick();
			rowEls[source.id]?.scrollIntoView({ block: 'nearest' });
			setTimeout(() => (justAdded = null), 2000);
		} finally {
			saving = false;
		}
	}
</script>

<div class="rounded-field border border-line bg-surface p-3">
	<!-- The caption ellipsizes rather than wrapping: this control also sits inside
	     narrow cards (a persona tile, a definition sub-section). -->
	<p
		class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
	>
		<Icon name="file" size={12} class="shrink-0 text-brand-500" />
		<span class="shrink-0">Sources</span>
		<span class="min-w-0 flex-1 truncate text-[9px] font-medium normal-case tracking-normal text-ink-300">
			· evidence behind {subject}
		</span>
		<span
			class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold tabular-nums normal-case tracking-normal {count >
			0
				? 'bg-success-50 text-success-600'
				: 'bg-surface-sunken text-ink-400'}"
		>
			{count}
		</span>
	</p>

	{#if cited.length > 0}
		<ul class="mt-2 flex flex-wrap gap-1">
			{#each cited as source (source.id)}
				{@const label = source.title || source.url || 'Untitled source'}
				{@const href = sourceHref(source)}
				<li
					class="inline-flex max-w-full items-center gap-1 rounded-pill bg-success-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-success-700"
				>
					{#if isInlineFile(source)}
						<button
							type="button"
							onclick={() => openFileViewer({ name: label, dataUrl: source.url })}
							class="truncate underline-offset-2 hover:underline"
							title={`Preview ${label}`}
						>
							{label}
						</button>
					{:else if href}
						<a
							{href}
							target="_blank"
							rel="noopener noreferrer"
							class="truncate underline-offset-2 hover:underline"
							title={`Open ${source.url}`}
						>
							{label}
						</a>
					{:else}
						<!-- A reference with nothing to open ("Ops lead interview") — still
						     named in full on hover, just not a dead link. -->
						<span class="truncate" title={source.url || label}>{label}</span>
					{/if}
					<button
						type="button"
						onclick={() => onToggle(source.id)}
						aria-label={`Remove citation ${label}`}
						class="grid size-3.5 shrink-0 place-items-center rounded-full text-success-600 transition hover:bg-success-100 hover:text-success-800"
					>
						<Icon name="x" size={10} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Only CHOOSING sources folds away: the picker is a long list plus a form,
	     and it is not what you come to this widget to read. -->
	<details class="mt-2" {open}>
		<summary
			class="inline-flex cursor-pointer list-none items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-600 hover:underline"
		>
			<Icon name="plus" size={11} />
			{cited.length > 0 ? 'Change sources' : 'Cite a source'}
		</summary>

		<div class="mt-2.5 space-y-2">
			{#if sources.length > 0}
				<label class="relative block">
					<span class="sr-only">Search sources</span>
					<Icon
						name="search"
						size={12}
						class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-300"
					/>
					<input
						type="search"
						bind:value={query}
						placeholder="Search sources…"
						class="w-full rounded-field border border-line bg-surface py-1.5 pl-7 pr-2 text-[12px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
					/>
				</label>

				<div class="max-h-44 space-y-1 overflow-y-auto pr-1">
					{#each visible as source (source.id)}
						<label
							bind:this={rowEls[source.id]}
							class="flex cursor-pointer items-start gap-2 rounded-field px-2 py-1.5 text-[13px] text-ink-700 transition-colors hover:bg-surface-sunken {source.id ===
							justAdded
								? 'bg-success-50'
								: ''}"
						>
							<input
								type="checkbox"
								checked={(selected ?? []).includes(source.id)}
								onchange={() => onToggle(source.id)}
								class="mt-0.5 size-3.5 shrink-0 accent-brand-500"
							/>
							<span class="min-w-0">
								<span class="block truncate font-medium">
									{source.title || source.url || 'Untitled source'}
								</span>
								<span class="block truncate text-[10px] text-ink-400">
									{source.kind}{source.url ? ` · ${source.url}` : ''}
								</span>
							</span>
						</label>
					{/each}
					{#if visible.length === 0}
						<p class="px-2 py-1.5 text-[11px] italic text-ink-400">
							No source matches “{query.trim()}”.
						</p>
					{/if}
				</div>
			{:else if !adding}
				<p class="text-[11px] text-ink-400">
					No registered sources yet. Add the evidence {subject} rests on.
				</p>
			{/if}

			{#if registry?.canCreate}
				{#if adding}
					<!-- Registering in place: title is all that is required, so citing what
					     you just read is never blocked on filling a form. -->
					<form onsubmit={submit} class="space-y-1.5 rounded-field border border-brand-200 bg-surface p-2">
						<input
							bind:this={titleEl}
							bind:value={title}
							placeholder="Title, e.g. GDPR Art. 17, Ops lead interview"
							class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-[12px] text-ink-900 outline-none placeholder:text-ink-300 focus:border-brand-300"
						/>
						<div class="flex gap-1.5">
							<input
								bind:value={url}
								placeholder="https://…  or a reference"
								class="min-w-0 flex-1 rounded-field border border-line bg-surface px-2 py-1.5 font-mono text-[11px] text-ink-700 outline-none placeholder:font-sans placeholder:text-ink-300 focus:border-brand-300"
							/>
							<select
								bind:value={kind}
								aria-label="Source kind"
								class="shrink-0 rounded-field border border-line bg-surface px-1.5 py-1.5 text-[11px] font-medium text-ink-600 outline-none"
							>
								{#each DOCUMENT_KINDS as option (option.code)}
									<option value={option.code}>{option.label}</option>
								{/each}
							</select>
						</div>
						<div class="flex items-center gap-2">
							<button
								type="submit"
								disabled={saving || !title.trim()}
								class="rounded-field bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40"
							>
								{saving ? 'Registering…' : 'Register & cite'}
							</button>
							<button
								type="button"
								onclick={closeForm}
								class="text-[11px] font-medium text-ink-400 hover:text-ink-700"
							>
								Cancel
							</button>
							<a
								href={registry.documentsHref}
								class="ml-auto text-[10px] font-medium text-ink-400 hover:text-brand-600 hover:underline"
							>
								Full register ↗
							</a>
						</div>
					</form>
				{:else}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<button
							type="button"
							onclick={openForm}
							class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-600 hover:underline"
						>
							<Icon name="plus" size={11} /> New source
						</button>
						<a
							href={registry.documentsHref}
							class="shrink-0 whitespace-nowrap text-[10px] font-medium text-ink-400 hover:text-brand-600 hover:underline"
						>
							Full register ↗
						</a>
					</div>
				{/if}
			{/if}
		</div>
	</details>

	{#if broken.length > 0}
		<p class="mt-2 rounded-field bg-warning-50 px-2 py-1.5 text-[11px] text-warning-700">
			{broken.length} linked {broken.length === 1
				? 'source no longer exists'
				: 'sources no longer exist'}.
		</p>
	{/if}
</div>
