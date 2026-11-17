<script lang="ts">
	import { Icon, openFileViewer } from '$ui/design-system';
	import { DOCUMENT_KINDS, markPassages, sourceHref, type SourcePassage } from '$domain/documents';
	import { page } from '$app/state';
	import { rememberScroll } from '$ui/shell/return-scroll';
	import { closeSourceReader, pendingSourceReading } from './source-reader.svelte';

	/**
	 * The whole of one cited source: its own words, what kind of evidence it is,
	 * and the way to follow it. A source with no address still opens, because
	 * its content IS the evidence (spec: Read a cited source).
	 */
	const reading = $derived(pendingSourceReading());
	const source = $derived(reading?.source ?? null);
	const isInlineFile = $derived(!!source && source.url.trim().startsWith('data:'));
	const href = $derived(source && !isInlineFile ? sourceHref(source) : null);
	const kindLabel = $derived(
		DOCUMENT_KINDS.find((k) => k.code === source?.kind)?.label ?? source?.kind ?? 'Source'
	);
	const title = $derived(source ? source.title || source.url || 'Untitled source' : '');
	// The register filtered on this source, so the reader lands on it rather
	// than on the whole list (spec criterion 40aef524).
	// It also carries where the reader is now, so the register can offer the
	// way back (spec criterion 12c2df35).
	const currentPath = () => page.url.pathname + page.url.search;
	function leaveForRegister() {
		rememberScroll(currentPath(), reading?.anchor ?? null);
		closeSourceReader();
	}
	const registerHref = $derived.by(() => {
		if (!reading?.registerHref || !source?.id) return reading?.registerHref;
		const from = currentPath();
		return `${reading.registerHref}?source=${encodeURIComponent(source.id)}&from=${encodeURIComponent(from)}`;
	});

	/**
	 * Opened from an element whose source's text is stored, the reader shows that
	 * text with the element's passages highlighted, scrolled to the first, what
	 * the element took from each beside it (criterion f09da92d).
	 */
	let stored = $state<{ key: string; text: string; passages: SourcePassage[] } | null>(null);
	/** The source names a stored text the engine can no longer read: said above the note. */
	let missingKey = $state<string | null>(null);
	const storedKey = $derived(reading?.element && source?.id && source.stored ? `${reading.element.projectId}|${source.id}|${reading.element.anchor}` : null);
	$effect(() => {
		const key = storedKey;
		const element = reading?.element;
		const id = source?.id;
		if (!key || !element || !id) {
			stored = null;
			return;
		}
		let gone = false;
		const q = new URLSearchParams({ sourceId: id, anchor: element.anchor });
		void fetch(`/api/projects/${encodeURIComponent(element.projectId)}/passages?${q.toString()}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((body: { text?: string | null; textMissing?: boolean; passages?: SourcePassage[] } | null) => {
				if (gone) return;
				if (body?.textMissing) missingKey = key;
				if (typeof body?.text !== 'string') return;
				stored = { key, text: body.text, passages: body.passages ?? [] };
			})
			.catch(() => {});
		return () => {
			gone = true;
		};
	});
	const shown = $derived(stored && stored.key === storedKey ? stored : null);
	const segments = $derived(shown ? markPassages(shown.text, shown.passages) : []);
	const takesOf = (id: string) => shown?.passages.find((p) => p.id === id)?.takes ?? '';
	let textBox = $state<HTMLElement>();
	// The first passage comes into view once the text is there.
	$effect(() => {
		if (!shown || shown.passages.length === 0 || !textBox) return;
		requestAnimationFrame(() => textBox?.querySelector('mark')?.scrollIntoView({ block: 'center' }));
	});

	let closeButton = $state<HTMLButtonElement>();
	$effect(() => {
		if (!source) return;
		closeButton?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeSourceReader();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if source}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[140] flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeSourceReader();
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="source-reader-title"
			class="flex max-h-[85vh] w-full {shown ? 'max-w-3xl' : 'max-w-xl'} flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop"
		>
			<header class="flex items-start gap-3 border-b border-line px-5 py-4">
				<span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-field bg-success-50 text-success-700">
					<Icon name="file" size={15} />
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{kindLabel}{source.decision ? ` · ${source.decision.status}` : ''}
					</p>
					<h2 id="source-reader-title" class="mt-0.5 break-words text-base font-semibold text-ink-900">
						{title}
					</h2>
				</div>
				<button
					bind:this={closeButton}
					type="button"
					onclick={closeSourceReader}
					class="grid size-7 shrink-0 place-items-center rounded-field text-ink-500 hover:bg-surface-sunken hover:text-ink-900"
					aria-label="Close source"
				>
					<Icon name="x" size={15} />
				</button>
			</header>

			<div bind:this={textBox} class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				{#if shown}
					{#if shown.passages.length > 0}
						<ul class="mb-3 flex flex-col gap-1 text-xs text-ink-600">
							{#each shown.passages as passage, i (passage.id)}
								<li><span class="font-semibold text-ink-800">Passage {i + 1}:</span> {passage.takes}</li>
							{/each}
						</ul>
					{/if}
					<p class="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{#each segments as segment, i (i)}{#if segment.passageId}<mark class="bg-evo-amber/30 text-ink-900" title={takesOf(segment.passageId)}>{segment.text}</mark>{:else}{segment.text}{/if}{/each}</p>
				{:else if missingKey && missingKey === storedKey}
					<p class="mb-3 rounded-field bg-warning-50 px-2 py-1.5 text-xs text-warning-700">The stored text of this source can no longer be read: its address and its note below are what remains.</p>
					{#if source.note.trim()}<p class="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{source.note}</p>{/if}
				{:else if source.note.trim()}
					<p class="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{source.note}</p>
				{:else}
					<p class="text-sm italic text-ink-400">
						This source carries no words of its own: its address below is the evidence.
					</p>
				{/if}
			</div>

			<footer class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface-sunken/60 px-5 py-3 text-xs">
				{#if isInlineFile}
					<button
						type="button"
						onclick={() => openFileViewer({ name: title, dataUrl: source.url })}
						class="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline"
					>
						<Icon name="eye" size={13} /> Preview the file
					</button>
				{:else if href}
					<a
						{href}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex min-w-0 items-center gap-1.5 font-semibold text-brand-600 hover:underline"
					>
						<Icon name="external-link" size={13} class="shrink-0" />
						<span class="truncate">{source.url}</span>
					</a>
				{:else if source.url.trim()}
					<span class="min-w-0 text-ink-500">
						<span class="font-medium text-ink-600">Reference:</span>
						{source.url}
					</span>
				{/if}
				{#if registerHref}
					<a
						href={registerHref}
						onclick={leaveForRegister}
						class="ml-auto shrink-0 font-medium text-ink-400 hover:text-brand-600 hover:underline"
					>
						View in Sources ↗
					</a>
				{/if}
			</footer>
		</div>
	</div>
{/if}
