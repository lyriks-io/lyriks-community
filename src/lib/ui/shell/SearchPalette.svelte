<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { ProjectTabs } from '$domain/portfolio/project-tabs';
	import type { PortfolioView } from '$domain/portfolio';
	import { pageEntries, type SearchEntry } from './app-search';
	import { projectSearchEntries } from './project-search-entries';
	import { marked, paletteGroups, parseRecent, remember, type PaletteRow } from './search-palette';
	import { timeAgo } from './notification-view';
	import type { RecentChange } from '$domain/features/recent-changes';
	import { shell } from './shell-state.svelte';
	import { openOnboarding } from './onboarding.svelte';
	import SidePanel from './SidePanel.svelte';
	import SideIcon from './SideIcon.svelte';

	/**
	 * The search (criterion e11bf80b, actions 6469d4f1 and 81640caa): a panel
	 * beside the navigation, opened from Search or Ctrl K / Cmd K. Empty, it
	 * lists Recent, kept on this browser, what was added or changed lately in the
	 * project, and the Actions; typed, what matches in this project (its rules
	 * found by their words), among the actions and among the other projects. The project's
	 * objects and the other projects are read the first time it opens, then
	 * filtered as the reader types. The arrow keys move the highlight, Enter
	 * opens it.
	 */
	interface Props {
		project: { id: string; name: string } | null;
		tabs: ProjectTabs | null;
		evolutions: readonly { t: string; href: string }[];
	}
	let { project, tabs, evolutions }: Props = $props();

	const RECENT_KEY = 'lyriks.search.recent';
	const open = $derived(shell.panel === 'search');
	let q = $state('');
	let hit = $state(0);
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLElement>();
	let objects = $state<SearchEntry[]>([]);
	let lately = $state<RecentChange[]>([]);
	let others = $state<{ id: string; name: string }[]>([]);
	let recent = $state<PaletteRow[]>([]);
	let readFor: string | null = null;
	let projectsRead = false;

	const base = $derived(project ? `/projects/${encodeURIComponent(project.id)}` : null);
	const index = $derived<SearchEntry[]>([...evolutions.map((e) => ({ ...e, k: 'Evolution' })), ...pageEntries(project?.id ?? null), ...objects]);
	// New evolution where the project takes evolutions (its Evolutions tab is open).
	const actions = $derived<PaletteRow[]>([
		...(base && tabs?.tabs.includes('evolutions') ? [{ g: 'Action', t: 'New change', p: '', href: `${base}/evolution?new=1` }] : []),
		// A viewer of the workspace the switcher shows is offered no project creation (rule 029ff8b4).
		...(page.data.mayCreateProjects === false ? [] : [{ g: 'Action', t: 'New project', p: '', act: 'new-project' as const }])
	]);
	const projects = $derived<PaletteRow[]>(others.filter((p) => p.id !== project?.id).map((p) => ({ g: 'Project', t: p.name, p: 'Switch project', href: `/projects/${encodeURIComponent(p.id)}` })));
	// What was added or changed lately, each opening its page (criterion e11bf80b).
	const changed = $derived<PaletteRow[]>(
		base
			? lately.map((c) => ({
					g: c.kind === 'core' ? 'Area' : 'Feature',
					t: c.name,
					p: `${c.change === 'added' ? 'Added' : 'Changed'} ${timeAgo(c.at)}`,
					href: `${base}/spec/features/${encodeURIComponent(c.id)}`
				}))
			: []
	);
	const groups = $derived(paletteGroups(q, { index, actions, projects, recent, changed }));
	const rows = $derived(groups.flatMap((g) => g.rows));

	$effect(() => {
		if (!open) return;
		q = '';
		hit = 0;
		try {
			recent = parseRecent(localStorage.getItem(RECENT_KEY));
		} catch {
			recent = [];
		}
		void read();
	});

	async function read() {
		if (project && readFor !== project.id) {
			readFor = project.id;
			const found = await projectSearchEntries(project.id).catch(() => ({ entries: [], recent: [] }));
			objects = found.entries;
			lately = found.recent;
		}
		if (!projectsRead) {
			projectsRead = true;
			const res = await fetch('/api/projects').catch(() => null);
			if (res?.ok) {
				const { portfolio } = (await res.json()) as { portfolio: PortfolioView };
				others = [...portfolio.domains.flatMap((d) => d.projects), ...portfolio.unassigned].map((p) => ({ id: p.id, name: p.name }));
			} else projectsRead = false;
		}
	}

	/** Open a row (action 81640caa): it goes to the top of Recent on this browser, and the panel closes. */
	function go(row: PaletteRow | undefined) {
		if (!row) return;
		recent = remember(recent, row);
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
		} catch {
			// A browser that keeps nothing simply has no Recent.
		}
		shell.close();
		if (row.act === 'new-project') openOnboarding();
		else if (row.href) void goto(row.href);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			hit = Math.max(0, Math.min(rows.length - 1, hit + (e.key === 'ArrowDown' ? 1 : -1)));
			queueMicrotask(() => list?.querySelector('.r.hit')?.scrollIntoView({ block: 'nearest' }));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			go(rows[hit]);
		}
	}
</script>

<SidePanel {open} label="Search Lyriks" onclose={() => shell.close()} focus={() => input}>
	{#snippet head()}
		<SideIcon name="search" />
		<input
			bind:this={input}
			bind:value={q}
			oninput={() => (hit = 0)}
			onkeydown={onKey}
			type="text"
			placeholder="Search a page, a feature, a rule, a profile, a project…"
			aria-label="Search"
			autocomplete="off"
		/>
	{/snippet}
	<div bind:this={list}>
		{#each groups as group (group.title)}
			<div class="sec">{group.title}</div>
			{#each group.rows as row, j (j)}
				{@const i = rows.indexOf(row)}
				{@const m = marked(row.t, q)}
				<button type="button" class="r" class:hit={i === hit} class:rule={row.g === 'Rule'} onmousemove={() => (hit = i)} onclick={() => go(row)}>
					<span class="g">{row.g}</span>
					{#if row.g === 'Rule'}
						<!-- A rule reads its whole name, then why it was found, then where it holds: the row grows with them (criterion e11bf80b). -->
						{@const why = row.sub ? marked(row.sub, q) : null}
						<span class="rc">
							<span class="tx">{m.before}{#if m.match}<mark>{m.match}</mark>{/if}{m.after}</span>
							{#if why}<span class="why">{why.before}{#if why.match}<mark>{why.match}</mark>{/if}{why.after}</span>{/if}
							{#if row.p}<span class="p">{row.p}</span>{/if}
						</span>
					{:else}
						<span class="tx">{m.before}{#if m.match}<mark>{m.match}</mark>{/if}{m.after}</span>
						{#if row.p}<span class="p">{row.p}</span>{/if}
					{/if}
					<kbd class="kbd">↵</kbd>
				</button>
			{/each}
		{:else}
			<div class="e">
				{#if q.trim()}Nothing matches “{q.trim()}”{project ? ` in ${project.name}` : ''}. Try a feature, a rule, a profile or a page.{:else}Nothing opened yet.{/if}
			</div>
		{/each}
	</div>
	{#snippet foot()}
		<span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> move</span>
		<span><kbd class="kbd">↵</kbd> open</span>
		<span><kbd class="kbd">esc</kbd> close</span>
		{#if project}<span class="pals">Search in <b>{project.name}</b></span>{/if}
	{/snippet}
</SidePanel>
