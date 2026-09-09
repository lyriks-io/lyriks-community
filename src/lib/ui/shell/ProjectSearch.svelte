<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';

	interface SearchItem {
		id: string;
		kind: string;
		label: string;
		detail: string;
		context: string;
		href: string;
	}

	interface Props {
		projectId: string;
		tone?: 'dark' | 'light';
	}
	let { projectId, tone = 'dark' }: Props = $props();

	let q = $state('');
	let items = $state<SearchItem[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let open = $state(false);
	let inputEl = $state<HTMLInputElement>();

	// One fetch per project: the full object index, filtered client-side. Reset
	// when the project changes so search always reflects the project you're in.
	$effect(() => {
		projectId; // track
		loaded = false;
		items = [];
	});

	async function ensureLoaded() {
		if (loaded || loading) return;
		loading = true;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/search`);
			items = res.ok ? ((await res.json()).items as SearchItem[]) : [];
			loaded = true;
		} catch {
			items = [];
		}
		loading = false;
	}

	const results = $derived.by(() => {
		const query = q.trim().toLowerCase();
		if (query.length < 2) return [];
		const scored: { item: SearchItem; score: number }[] = [];
		for (const it of items) {
			const label = it.label.toLowerCase();
			let score = -1;
			if (label === query) score = 0;
			else if (label.startsWith(query)) score = 1;
			else if (label.includes(query)) score = 2;
			else if (it.kind.toLowerCase().includes(query)) score = 3;
			else if (it.detail.toLowerCase().includes(query)) score = 4;
			else if (it.context.toLowerCase().includes(query)) score = 5;
			if (score >= 0) scored.push({ item: it, score });
		}
		scored.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
		return scored.slice(0, 20).map((s) => s.item);
	});

	function onInput() {
		open = q.trim().length >= 2;
		if (open) void ensureLoaded();
	}

	// The project layout leaves Cmd/Ctrl-K for search (Control Center uses J).
	$effect(() => {
		function onKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				inputEl?.focus();
				void ensureLoaded();
			}
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	// Node kind → icon (all in the offline set). Unmapped kinds fall back to a list.
	const ICON: Record<string, IconName> = {
		feature: 'grid',
		core: 'grid',
		family: 'grid',
		role: 'users',
		capability: 'users',
		journey: 'monitor',
		step: 'monitor',
		screen: 'monitor',
		component: 'grid',
		template: 'grid',
		entity: 'database',
		field: 'database',
		database: 'database',
		host: 'server',
		rule: 'sliders',
		tech: 'cpu',
		surface: 'layers',
		action: 'layers',
		event: 'layers',
		gap: 'flag',
		release: 'flag',
		project: 'cpu'
	};
	const iconFor = (kind: string): IconName => ICON[kind] ?? 'list';

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
		onfocus={() => {
			void ensureLoaded();
			open = q.trim().length >= 2;
		}}
		onblur={() => setTimeout(() => (open = false), 150)}
		placeholder="Search this project…  (⌘/Ctrl-K)"
		class="w-full rounded-pill py-1.5 pl-8 pr-3 text-sm outline-none {inputClass}"
	/>

	{#if open}
		<div class="absolute z-50 mt-1.5 max-h-96 w-full overflow-y-auto rounded-card border border-line bg-surface py-1 text-ink-900 shadow-lg">
			{#if loading && items.length === 0}
				<p class="px-3 py-2 text-xs text-ink-500">Searching…</p>
			{:else if results.length === 0}
				<p class="px-3 py-2 text-xs text-ink-500">No matches in this project.</p>
			{:else}
				{#each results as r (r.id)}
					<a href={r.href} class="flex items-center gap-2 px-3 py-2 text-sm text-ink-900 hover:bg-surface-sunken">
						<Icon name={iconFor(r.kind)} size={13} class="shrink-0 text-ink-400" />
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium leading-tight">{r.label}</span>
							<span class="block truncate text-[10px] leading-tight text-ink-400">
								{r.kind} · in {r.context}
							</span>
						</span>
					</a>
				{/each}
			{/if}
		</div>
	{/if}
</div>
