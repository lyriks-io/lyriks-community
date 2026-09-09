<script lang="ts">
	import { Icon } from '$ui/design-system';

	interface SearchResult {
		kind: 'project' | 'feature';
		projectId: string;
		projectName: string;
		label: string;
		context: string;
		href: string;
	}

	let { tone = 'dark' as 'dark' | 'light' } = $props();

	let inputEl = $state<HTMLInputElement>();
	let q = $state('');

	// Same shortcut as the in-project search, so ⌘/Ctrl-K always lands in the bar.
	$effect(() => {
		function onKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				inputEl?.focus();
			}
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
	let results = $state<SearchResult[]>([]);
	let open = $state(false);
	let loading = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function onInput() {
		if (timer) clearTimeout(timer);
		const query = q;
		if (query.trim().length < 2) {
			results = [];
			open = false;
			return;
		}
		loading = true;
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
				results = res.ok ? ((await res.json()).results as SearchResult[]) : [];
			} catch {
				results = [];
			}
			loading = false;
			open = true;
		}, 250);
	}

	const inputClass = $derived(
		tone === 'dark'
			? 'border border-white/40 bg-white/95 text-ink-900 placeholder:text-ink-500 shadow-sm focus:border-white focus:bg-white'
			: 'bg-surface-sunken text-ink-900 placeholder:text-ink-400 border border-line focus:border-brand-300'
	);
</script>

<div class="relative w-full max-w-md">
	<div class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center {tone === 'dark' ? 'text-ink-500' : 'text-ink-400'}">
		<Icon name="search" size={14} />
	</div>
	<input
		bind:this={inputEl}
		bind:value={q}
		oninput={onInput}
		onfocus={() => (open = results.length > 0)}
		onblur={() => setTimeout(() => (open = false), 150)}
		placeholder="Search projects…  (⌘/Ctrl-K)"
		class="w-full rounded-pill py-1.5 pl-8 pr-3 text-sm outline-none {inputClass}"
	/>

	{#if open}
		<div class="absolute z-50 mt-1.5 max-h-80 w-full overflow-y-auto rounded-card border border-line bg-surface py-1 text-ink-900 shadow-lg">
			{#if loading && results.length === 0}
				<p class="px-3 py-2 text-xs text-ink-500">Searching…</p>
			{:else if results.length === 0}
				<p class="px-3 py-2 text-xs text-ink-500">No matches.</p>
			{:else}
				{#each results as r (r.kind + r.projectId + r.label)}
					<a href={r.href} class="flex items-center gap-2 px-3 py-2 text-sm text-ink-900 hover:bg-surface-sunken">
						<Icon name={r.kind === 'project' ? 'cpu' : 'sparkles'} size={13} class="shrink-0 text-ink-400" />
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium leading-tight">{r.label}</span>
							{#if r.context}<span class="block truncate text-[10px] leading-tight text-ink-400">in {r.context}</span>{/if}
						</span>
						<span class="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
							{r.kind === 'project' ? 'project' : r.projectName}
						</span>
					</a>
				{/each}
			{/if}
		</div>
	{/if}
</div>
