<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { brandExportMarkdown, type ProjectBrand } from '$domain/experience';
	import type { ToastNotifierPort } from '$application/ports';

	interface Props {
		brand: ProjectBrand;
		notifier: ToastNotifierPort;
		/** Opens the tokens JSON and CSS variables, which sit beside the design.md. */
		onMoreFormats: () => void;
	}
	let { brand, notifier, onMoreFormats }: Props = $props();

	// Live: every edit to a source rewrites the file the agent will read.
	const md = $derived(brandExportMarkdown(brand));

	async function copy() {
		try {
			await navigator.clipboard.writeText(md);
			notifier.notify('info', 'design.md copied to clipboard.');
		} catch {
			notifier.notify('error', 'Could not copy to clipboard.');
		}
	}

	function download() {
		const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = 'design.md';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<section class="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
	<header class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
		<Icon name="file" size={16} />
		<h2 class="text-sm font-bold text-ink-900">design.md</h2>
		<p class="text-xs text-ink-500">What a coding agent reads to build the UI on-brand. It follows the sources on the left.</p>
		<div class="ml-auto flex gap-1.5">
			<button type="button" onclick={copy} class="inline-flex items-center gap-1.5 rounded-field bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-card">
				<Icon name="copy" size={13} /> Copy design.md
			</button>
			<button type="button" onclick={download} class="rounded-field border border-line px-3 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600">
				Download
			</button>
			<button type="button" onclick={onMoreFormats} class="rounded-field border border-line px-3 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600">
				Tokens JSON &amp; CSS
			</button>
		</div>
	</header>
	<pre class="max-h-[70vh] overflow-auto bg-surface-sunken p-4 text-xs leading-relaxed whitespace-pre-wrap text-ink-800"><code>{md}</code></pre>
</section>
