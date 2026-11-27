<script lang="ts">
	import type { ProjectTabs } from '$domain/portfolio/project-tabs';
	import { isCommunity, lockedSentence, planOpening, UPGRADE_PLAN_NAMES } from '$domain/licensing';
	import { page } from '$app/state';
	import { projectNavTabs } from './app-nav';
	import { navCapabilitiesFor } from './capabilities';
	import { shownPath } from './shown-path.svelte';
	import { sidePlace, type SideEntry } from './side-nav';
	import type { SideIconName } from './side-icons';
	import SideIcon from './SideIcon.svelte';

	/**
	 * The current project's entries in the navigation (criterion b2f17eef), one
	 * row each under no heading, always the same five whatever the project
	 * holds (owner 2026-11-07): Reverse (the Reverse page: the run under way,
	 * else the last run and the history of the runs, criterion 2dbed801),
	 * Knowledge (its chapters are the tab bar of its pages, criterion
	 * 8e942b12), Changes with the evolutions still under way, Mismatch with the
	 * code changes waiting for a decision, and Notices; a section with nothing
	 * yet says why on its own page (criterion 6213ef4c). The project's
	 * Settings follow them for whoever administers the project, where the
	 * Enterprise overlay registers them (criterion a3ada381). The entry of the
	 * page on screen lights the moment it is chosen (criterion d7b34c94) and
	 * stays lit on every page under it.
	 */
	interface Props {
		projectId: string;
		tabs: ProjectTabs | null;
		/** How many of the project's evolutions are still under way. */
		openEvolutions: number;
		drift: { pending: number } | null;
	}
	let { projectId, tabs, openEvolutions, drift }: Props = $props();

	const base = $derived(`/projects/${encodeURIComponent(projectId)}`);
	const spec = $derived(`${base}/spec`);
	const opened = $derived(new Set(projectNavTabs(projectId, tabs?.tabs ?? null).map((t) => t.id)));
	const place = $derived(sidePlace(shownPath()));

	// The entry lit comes into view in a long navigation.
	let nav = $state<HTMLElement>();
	$effect(() => {
		void place;
		requestAnimationFrame(() => nav?.querySelector('.si.on')?.scrollIntoView({ block: 'nearest' }));
	});

	// Reverse opens the Reverse page, the run under way or the history of the runs (criteria 9359cb3c, 2dbed801).
	const running = $derived(opened.has('retro'));
	const lit = (entry: SideEntry) => place.entry === entry;
	// The project's own settings, shown to whoever administers it (criterion 7ebad53e of feat-135).
	const administers = $derived(!!(page.data as { administers?: boolean }).administers);
	const settings = $derived(navCapabilitiesFor(administers).filter((c) => c.foot && c.route));
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

	// Evolutions are not part of Community (EVO-001): the entry stays, locked, naming the plan that opens them.
	const evolutionsLocked = $derived(isCommunity((page.data as { edition?: string | null }).edition));
	const evolutionsPlan = UPGRADE_PLAN_NAMES[planOpening('evolutions')];
	const evolutionsTitle = $derived(
		evolutionsLocked ? lockedSentence('evolutions') : openEvolutions ? `${plural(openEvolutions, 'evolution', 'evolutions')} under way` : undefined
	);
</script>

{#snippet entry(key: SideEntry, label: string, href: string, icon: SideIconName, count: number, title?: string, lockedBy?: string)}
	<a class="si" class:on={lit(key)} class:locked={!!lockedBy} {href} aria-current={lit(key) ? 'page' : undefined} data-tip={label} {title}>
		<span class="lab"><SideIcon name={icon} size={16} strokeWidth={1.8} /><span class="txt">{label}</span></span>
		{#if lockedBy}<span class="nplan">{lockedBy}</span>{:else if count > 0}<span class="ncount">{count}</span>{/if}
	</a>
{/snippet}

<!-- Always the same five, whatever the project holds; a section with nothing yet says why on its page (criteria b2f17eef, 6213ef4c). -->
<nav bind:this={nav} class="sn" aria-label="Project navigation">
	{@render entry('retro', 'Reverse', `${base}/retrospec`, 'reverse', 0, running ? 'The Reverse-Specification under way' : 'The Reverse-Specifications of the product')}
	{@render entry('knowledge', 'Knowledge', spec, 'knowledge', 0)}
	{@render entry('evolutions', 'Changes', `${base}/evolution`, 'changes', evolutionsLocked ? 0 : openEvolutions, evolutionsTitle, evolutionsLocked ? evolutionsPlan : undefined)}
	{@render entry(
		'drift',
		'Mismatch',
		`${base}/drift`,
		'mismatch',
		drift?.pending ?? 0,
		drift?.pending ? `${plural(drift.pending, 'code change waits', 'code changes wait')} for a decision` : 'Code changes made outside the specification'
	)}
	{@render entry('noticed', 'Health', `${spec}/noticed`, 'notices', 0)}
	{#each settings as cap (cap.id)}
		{@render entry('settings', cap.title, cap.route?.(projectId) ?? `${base}/settings`, 'settings', 0, "The project's settings")}
	{/each}
</nav>

<style>
	/* The project's entries of the v3 design's sidebar: an icon and a name, a count at the right. */
	:global {
		.lk-side .sn {
			flex: 1;
			min-height: 0;
			padding: 4px 0 10px;
			overflow: auto;
			scrollbar-color: var(--color-night) transparent;
			scrollbar-width: thin;
		}
		.lk-side .sn .si {
			padding-right: 18px;
			padding-left: 27px;
		}
		.lk-side .sn .si.on {
			border-left-color: var(--color-blue);
			background: var(--color-night);
			color: var(--color-paper);
		}
		.lk-side .ncount {
			flex: none;
			margin-left: auto;
			color: var(--color-orange);
			font: 500 0.6875rem/1 var(--font-evo-mono);
		}

		.lk-side .sn .si.locked .txt {
			opacity: 0.6;
		}
		.lk-side .nplan {
			flex: none;
			margin-left: auto;
			padding: 2px 5px;
			border: 1px solid currentColor;
			opacity: 0.75;
			font: 600 0.5625rem/1 var(--font-evo-mono);
			letter-spacing: 0.05em;
			text-transform: uppercase;
			white-space: nowrap;
		}
		.lk-side.folded .nplan {
			display: none;
		}

		.lk-side.folded .sn {
			padding: 0 0 10px;
		}
		.lk-side.folded .sn .si {
			padding: 0;
		}
		.lk-side.folded .ncount {
			position: absolute;
			top: 7px;
			right: 13px;
			width: 7px;
			height: 7px;
			overflow: hidden;
			background: var(--color-orange);
			font-size: 0;
		}
	}
</style>
