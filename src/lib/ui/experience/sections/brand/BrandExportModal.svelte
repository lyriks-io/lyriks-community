<script lang="ts">
	import { Icon } from '$ui/design-system';
	import {
		brandExportCss,
		brandExportJson,
		brandExportMarkdown,
		type ProjectBrand
	} from '$domain/experience';
	import type { ToastNotifierPort } from '$application/ports';

	interface Props {
		brand: ProjectBrand;
		notifier: ToastNotifierPort;
		onClose: () => void;
	}
	let { brand, notifier, onClose }: Props = $props();

	type Tab = 'md' | 'json' | 'css';
	let tab = $state<Tab>('md');

	const md = $derived(brandExportMarkdown(brand));
	const json = $derived(JSON.stringify(brandExportJson(brand), null, 2));
	const css = $derived(brandExportCss(brand));

	const TABS: { id: Tab; label: string; ext: string }[] = [
		{ id: 'md', label: 'Markdown brief', ext: 'md' },
		{ id: 'json', label: 'Tokens JSON', ext: 'json' },
		{ id: 'css', label: 'CSS variables', ext: 'css' }
	];
	const body = $derived(tab === 'md' ? md : tab === 'json' ? json : css);
	const brandName = $derived(brand.identity.name || 'brand');
	const safeName = $derived(brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand');

	async function copy(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			notifier.notify('info', `${label} copied to clipboard.`);
		} catch {
			notifier.notify('error', 'Could not copy to clipboard.');
		}
	}
	const copyAll = () =>
		copy(`# ${brandName} - brand brief\n\n${md}\n\n## Tokens (JSON)\n\n\`\`\`json\n${json}\n\`\`\`\n\n## CSS variables\n\n\`\`\`css\n${css}\n\`\`\`\n`, 'Full brief');

	function download() {
		const t = TABS.find((x) => x.id === tab)!;
		const blob = new Blob([body], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${safeName}-brief.${t.ext}`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
	role="button"
	tabindex="-1"
	onclick={(e) => e.target === e.currentTarget && onClose()}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<div class="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
		<div class="flex items-center gap-3 border-b border-line px-5 py-3">
			<Icon name="download" size={16} />
			<h2 class="text-sm font-bold text-ink-900">Export LLM brief</h2>
			<button type="button" onclick={onClose} class="ml-auto text-ink-400 hover:text-ink-700" aria-label="Close"><Icon name="x" size={16} /></button>
		</div>

		<div class="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
			<div class="inline-flex gap-0.5 rounded-field border border-line bg-surface-sunken p-1">
				{#each TABS as t (t.id)}
					<button
						type="button"
						onclick={() => (tab = t.id)}
						class="rounded px-3 py-1 text-xs font-semibold transition-colors {tab === t.id ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800'}"
					>
						{t.label}
					</button>
				{/each}
			</div>
			<div class="ml-auto flex gap-1.5">
				<button type="button" onclick={copyAll} class="inline-flex items-center gap-1.5 rounded-field bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-card">
					<Icon name="sparkles" size={13} /> Copy ALL (paste in LLM)
				</button>
				<button type="button" onclick={() => copy(body, 'This tab')} class="rounded-field border border-line px-3 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600">
					Copy this tab
				</button>
				<button type="button" onclick={download} class="rounded-field border border-line px-3 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600">
					Download
				</button>
			</div>
		</div>

		<pre class="flex-1 overflow-auto bg-surface-sunken p-4 text-xs leading-relaxed text-ink-800"><code>{body}</code></pre>
	</div>
</div>
