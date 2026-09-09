<script lang="ts">
	import { fileKind, parseDataUrl } from '$domain/experience';
	import Icon from './Icon.svelte';
	import Button from './Button.svelte';
	import { renderMarkdown } from './markdown';
	import { pendingFile, closeFileViewer, downloadFile } from './file-viewer.svelte';

	const file = $derived(pendingFile());
	const parsed = $derived(file ? parseDataUrl(file.dataUrl) : null);
	const kind = $derived(file ? fileKind(file.name, parsed?.mime ?? '') : 'other');

	/** Decode a base64 data URL to a UTF-8 string (for text/markdown previews). */
	function decodeText(base64: string): string {
		const bin = atob(base64);
		const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	}

	// PDFs render most reliably from a blob URL rather than a data: iframe src.
	let blobUrl = $state<string | null>(null);
	$effect(() => {
		if (file && kind === 'pdf' && parsed) {
			const bin = atob(parsed.base64);
			const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
			// Force application/pdf, never the file's own MIME: a `.pdf`-named file
			// can carry a `data:text/html` payload, which would otherwise render as
			// same-origin HTML in the iframe and execute script (stored XSS).
			const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
			blobUrl = url;
			return () => URL.revokeObjectURL(url);
		}
		blobUrl = null;
	});
</script>

{#if file}
	{@const f = file}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="dialog"
		aria-modal="true"
		aria-label={f.name}
		class="fixed inset-0 z-50 flex flex-col bg-ink-900/60 p-4 backdrop-blur-sm sm:p-8"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeFileViewer();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeFileViewer();
		}}
		tabindex="-1"
	>
		<div class="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop">
			<header class="flex items-center gap-3 border-b border-line px-4 py-2.5">
				<Icon name={kind === 'image' ? 'image' : 'file'} size={16} />
				<p class="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">{f.name}</p>
				<Button variant="soft" size="sm" onclick={() => downloadFile(f)}>
					<Icon name="download" size={13} /> Download
				</Button>
				<button
					type="button"
					onclick={closeFileViewer}
					class="grid size-7 place-items-center rounded-field text-ink-500 hover:bg-surface-sunken hover:text-ink-900"
					aria-label="Close preview"
				>
					<Icon name="x" size={15} />
				</button>
			</header>

			<div class="min-h-0 flex-1 overflow-auto bg-surface-sunken">
				{#if kind === 'image'}
					<div class="grid h-full place-items-center p-4">
						<img src={f.dataUrl} alt={f.name} class="max-h-full max-w-full object-contain" />
					</div>
				{:else if kind === 'pdf' && blobUrl}
					<!-- sandbox without allow-scripts: renders the PDF, can never run script -->
					<iframe src={blobUrl} title={f.name} sandbox="allow-same-origin" class="h-full w-full border-0"></iframe>
				{:else if kind === 'markdown' && parsed}
					<!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized by renderMarkdown -->
					<article class="md-preview mx-auto max-w-2xl p-6 text-sm leading-relaxed text-ink-800">
						{@html renderMarkdown(decodeText(parsed.base64))}
					</article>
				{:else if kind === 'text' && parsed}
					<pre class="whitespace-pre-wrap p-6 font-mono text-xs leading-relaxed text-ink-800">{decodeText(parsed.base64)}</pre>
				{:else}
					<div class="grid h-full place-items-center p-8 text-center">
						<div class="space-y-3 text-ink-400">
							<Icon name="file" size={40} />
							<p class="text-sm">No inline preview for this file type.</p>
							<Button variant="soft" size="sm" onclick={() => downloadFile(f)}>
								<Icon name="download" size={13} /> Download {f.name}
							</Button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Minimal typographic styling for sanitized markdown injected via {@html}. */
	.md-preview :global(h1),
	.md-preview :global(h2),
	.md-preview :global(h3) {
		font-weight: 600;
		line-height: 1.3;
		margin: 1.2em 0 0.5em;
	}
	.md-preview :global(h1) {
		font-size: 1.5em;
	}
	.md-preview :global(h2) {
		font-size: 1.25em;
	}
	.md-preview :global(h3) {
		font-size: 1.1em;
	}
	.md-preview :global(p),
	.md-preview :global(ul),
	.md-preview :global(ol),
	.md-preview :global(blockquote),
	.md-preview :global(pre),
	.md-preview :global(table) {
		margin: 0.6em 0;
	}
	.md-preview :global(ul),
	.md-preview :global(ol) {
		padding-left: 1.4em;
	}
	.md-preview :global(ul) {
		list-style: disc;
	}
	.md-preview :global(ol) {
		list-style: decimal;
	}
	.md-preview :global(a) {
		color: var(--color-brand-600, #2563eb);
		text-decoration: underline;
	}
	.md-preview :global(code) {
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
		background: rgb(0 0 0 / 0.05);
		padding: 0.1em 0.35em;
		border-radius: 4px;
	}
	.md-preview :global(pre) {
		background: rgb(0 0 0 / 0.05);
		padding: 0.8em 1em;
		border-radius: 8px;
		overflow-x: auto;
	}
	.md-preview :global(pre code) {
		background: none;
		padding: 0;
	}
	.md-preview :global(blockquote) {
		border-left: 3px solid rgb(0 0 0 / 0.15);
		padding-left: 1em;
		color: rgb(0 0 0 / 0.6);
	}
	.md-preview :global(table) {
		border-collapse: collapse;
	}
	.md-preview :global(th),
	.md-preview :global(td) {
		border: 1px solid rgb(0 0 0 / 0.12);
		padding: 0.4em 0.7em;
	}
	.md-preview :global(img) {
		max-width: 100%;
	}
</style>
