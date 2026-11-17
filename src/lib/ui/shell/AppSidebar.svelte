<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import type { WorkspaceSummary } from '$application/ports';
	import type { AppChrome } from '$lib/shared/app-chrome';
	import { shownPath } from './shown-path.svelte';
	import { activeAppTab } from './app-nav';
	import { shell } from './shell-state.svelte';
	import { readHere } from './notification-reads.svelte';
	import type { FirstStep } from './first-steps-guide';
	import SideIcon from './SideIcon.svelte';
	import SideHead from './SideHead.svelte';
	import SideProjectNav from './SideProjectNav.svelte';
	import SideFoot from './SideFoot.svelte';
	import SearchPalette from './SearchPalette.svelte';
	import ProjectPalette from './ProjectPalette.svelte';
	import NotificationsPanel from './NotificationsPanel.svelte';
	import NotificationToasts from './NotificationToasts.svelte';
	import OnboardingDialog from './OnboardingDialog.svelte';

	/**
	 * THE navigation of the app (criterion b2f17eef): one ink column down the
	 * left of every signed-in page, in the design's order: the logo and the fold
	 * button; Home, Search, Notifications; the current project and its sections;
	 * at its foot what runs now, Help & support and the account. It folds to its
	 * icons ([ key, remembered on this browser, criterion 53c5c6f0), and on a
	 * narrow screen it hides behind the top bar's Menu (criterion d5c9c712). The
	 * three panels it opens (search, notifications, projects) slide out beside
	 * it, one at a time.
	 */
	interface Props {
		current: { id: string; name: string } | null;
		chrome: AppChrome;
		/** Folded to its icons: the server's reading of this browser until the page runs, then the shell's. */
		folded: boolean;
		steps: FirstStep[];
		email?: string;
		memberName?: string;
		workspaces?: WorkspaceSummary[];
		activeWorkspace?: string | null;
	}
	let { current, chrome, folded, steps, email, memberName, workspaces = [], activeWorkspace = null }: Props = $props();

	const unread = $derived(chrome.notifications.filter((n) => n.unread && !readHere(n.id)).length);
	const home = $derived(activeAppTab(shownPath()) === 'home');
	// A phone neither folds the navigation nor shows it folded (criterion d5c9c712).
	const iconsOnly = $derived(folded && !shell.narrow);

	/** A key typed into a field is the reader's text, never a shortcut. */
	const typing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

	function onKey(e: KeyboardEvent) {
		// Ctrl K or Cmd K opens the search from anywhere (criterion e11bf80b).
		if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			shell.toggle('search');
			return;
		}
		// [ folds and unfolds the navigation, outside a text field (action eff9578e).
		if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !shell.narrow && !typing(e.target)) {
			e.preventDefault();
			shell.fold(!shell.folded);
		}
		if (e.key === 'Escape' && shell.menuOpen) shell.menuOpen = false;
	}

	// The navigation of a phone closes once an entry is chosen (action 49cb038f), and a panel gives way to the page opened.
	afterNavigate(() => {
		shell.menuOpen = false;
		shell.close();
	});

	onMount(() => {
		const narrow = window.matchMedia('(max-width: 980px)');
		const read = () => {
			shell.narrow = narrow.matches;
			if (!narrow.matches) shell.menuOpen = false;
		};
		read();
		narrow.addEventListener('change', read);
		return () => narrow.removeEventListener('change', read);
	});

	// Folded, each icon names itself beside it while the pointer rests on it (criterion 53c5c6f0).
	let tip = $state<{ text: string; top: number } | null>(null);
	function showTip(e: PointerEvent) {
		if (!iconsOnly) return;
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
		if (!el) return void (tip = null);
		const box = el.getBoundingClientRect();
		tip = { text: el.dataset.tip ?? '', top: box.top + box.height / 2 };
	}
	$effect(() => {
		if (!iconsOnly) tip = null;
	});

</script>

<svelte:window onkeydown={onKey} />

{#if shell.menuOpen}
	<button type="button" class="lk-side-scrim" aria-label="Close the menu" onclick={() => (shell.menuOpen = false)}></button>
{/if}
<aside
	class="lk-side"
	class:folded={iconsOnly}
	class:open={shell.menuOpen}
	aria-label="Navigation"
	onpointerover={showTip}
	onpointerleave={() => (tip = null)}
>
	<SideHead {folded} {iconsOnly} />
	<div class="sact">
		<a class="si" class:on={home} href="/" aria-current={home ? 'page' : undefined} data-tip="Home"><span class="lab"><SideIcon name="home" /><span class="txt">Home</span></span></a>
		<button type="button" class="si" class:on={shell.panel === 'search'} data-panel-trigger aria-haspopup="dialog" aria-expanded={shell.panel === 'search'} data-tip="Search" onclick={() => shell.toggle('search')}>
			<span class="lab"><SideIcon name="search" /><span class="txt">Search</span></span>
		</button>
		<button
			type="button"
			class="si"
			class:on={shell.panel === 'notifications'}
			data-panel-trigger
			aria-haspopup="dialog"
			aria-expanded={shell.panel === 'notifications'}
			aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
			data-tip="Notifications"
			onclick={() => shell.toggle('notifications')}
		>
			<span class="lab"><SideIcon name="bell" /><span class="txt">Notifications</span></span>
			{#if unread > 0}<span class="nbadge animate-lk-pop">{unread}</span>{/if}
		</button>
	</div>
	<div class="pscope">
		<button
			type="button"
			class="si pjb"
			class:on={shell.panel === 'projects'}
			data-panel-trigger
			aria-haspopup="dialog"
			aria-expanded={shell.panel === 'projects'}
			aria-label={current ? `Current project: ${current.name}. Switch project` : 'Choose a project'}
			data-tip={current ? `${current.name} · Switch project` : 'Choose a project'}
			onclick={() => shell.toggle('projects')}
		>
			<span class="lab"><SideIcon name="project" /><span class="pjt txt"><span class="pjn">{current?.name ?? 'Choose a project'}</span></span></span>
			<SideIcon name="right" size={14} class="cv2" />
		</button>
		{#if current}
			<SideProjectNav projectId={current.id} tabs={chrome.tabs} openEvolutions={chrome.openEvolutions} drift={chrome.drift} />
		{:else}
			<div class="sn"></div>
		{/if}
	</div>
	<SideFoot live={chrome.live} {steps} {email} {memberName} {workspaces} {activeWorkspace} />
</aside>
{#if tip}
	<span class="lk-side-tip" style:top="{tip.top}px" role="tooltip">{tip.text}</span>
{/if}

<SearchPalette project={current} tabs={chrome.tabs} evolutions={chrome.evolutions} />
<ProjectPalette {current} />
<NotificationsPanel items={chrome.notifications} />
<NotificationToasts items={chrome.notifications} />
<OnboardingDialog hasProject={!!current} />

<style>
	/* The design's ink sidebar (.side), shared by the parts of the navigation drawn in their own components. */
	:global {
		.lk-side {
			position: relative;
			z-index: 30;
			display: flex;
			flex: none;
			flex-direction: column;
			width: var(--side-w);
			min-height: 0;
			box-sizing: border-box;
			background: var(--color-ink);
			color: var(--color-paper);
			font-family: var(--font-evo);
			font-size: 0.8125rem;
			line-height: 1.5;
			transition: width 0.18s ease;
		}
		.lk-side .sh {
			display: flex;
			flex: none;
			align-items: center;
			gap: 10px;
			height: 56px;
			padding: 0 18px;
			border-bottom: 1px solid var(--color-night);
		}
		.lk-side .logo {
			display: flex;
		}
		.lk-side .logo img {
			display: block;
			width: auto;
			height: 18px;
		}
		.lk-side .sbtog {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 30px;
			height: 30px;
			margin-left: auto;
			padding: 0;
			border: 0;
			background: none;
			color: var(--color-ink-4);
			cursor: pointer;
		}
		.lk-side .sbtog:hover {
			background: var(--color-night);
			color: var(--color-paper);
		}
		.lk-side .si {
			display: flex;
			align-items: center;
			gap: 10px;
			box-sizing: border-box;
			width: 100%;
			min-height: 34px;
			padding: 0 18px 0 15px;
			border: 0;
			border-left: 3px solid transparent;
			background: none;
			color: var(--color-toner-2);
			font: 500 0.8125rem/1.2 var(--font-evo);
			text-align: left;
			text-decoration: none;
			cursor: pointer;
		}
		.lk-side .si:hover,
		.lk-side .si.on {
			background: var(--color-night);
			color: var(--color-paper);
		}
		.lk-side .sact .si.on,
		.lk-side .pjb.on {
			border-left-color: var(--color-blue);
		}
		.lk-side .si .lab {
			display: flex;
			flex: 1;
			align-items: center;
			align-self: stretch;
			gap: 10px;
			min-width: 0;
			overflow: hidden;
			color: inherit;
			text-decoration: none;
			white-space: nowrap;
		}
		.lk-side .txt {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.lk-side .sact {
			display: grid;
			flex: none;
			padding: 8px 0 4px;
		}
		.lk-side .nbadge {
			flex: none;
			box-sizing: border-box;
			min-width: 18px;
			height: 18px;
			margin-left: auto;
			padding: 0 5px;
			background: var(--color-red-ink);
			color: var(--color-paper);
			font: 700 0.625rem/1.125rem var(--font-evo-mono);
			text-align: center;
		}
		.lk-side .pscope {
			display: flex;
			flex: 1;
			flex-direction: column;
			min-height: 0;
			margin-top: 8px;
			padding-top: 10px;
			border-top: 1px solid var(--color-night);
		}
		.lk-side .pjb {
			min-height: 40px;
		}
		.lk-side .pjn {
			color: var(--color-paper);
			font-size: 0.9375rem;
			font-weight: 700;
		}
		.lk-side .pjb .cv2 {
			margin-left: auto;
			color: var(--color-ink-4);
		}
		.lk-side-tip {
			position: fixed;
			left: calc(var(--side-w) + 8px);
			z-index: 120;
			padding: 6px 10px;
			border: 1px solid var(--color-night);
			background: var(--color-ink);
			color: var(--color-paper);
			font: 500 0.75rem/1 var(--font-evo);
			white-space: nowrap;
			pointer-events: none;
			transform: translateY(-50%);
		}

		/* Folded to its icons (criterion 53c5c6f0). */
		.lk-side.folded .sh {
			justify-content: center;
			padding: 0;
		}
		.lk-side.folded .logo {
			display: none;
		}
		/* Folded, the fold button is the Lyriks mark with an arrow; pointed at or reached by the keyboard, the mark gives
		   way to the unfold icon, so what a click does is told where the click is made (criterion 53c5c6f0). */
		.lk-side.folded .sbtog {
			position: relative;
			width: 44px;
			height: 36px;
			margin: 0;
			color: var(--color-ink-4);
		}
		.lk-side.folded .sbtog .ar {
			transform: scaleX(-1);
			transform-origin: 14.25px 12px;
		}
		.lk-side.folded .sbtog :is(.pn, .mk) {
			position: absolute;
			top: 50%;
			left: 50%;
			translate: -50% -50%;
			transition:
				opacity 0.16s ease,
				scale 0.16s ease;
		}
		.lk-side.folded .sbtog .pn {
			opacity: 0;
			scale: 0.8;
		}
		.lk-side.folded .sbtog:is(:hover, :focus-visible) .pn {
			opacity: 1;
			scale: 1;
		}
		.lk-side.folded .sbtog:is(:hover, :focus-visible) .mk {
			opacity: 0;
			scale: 0.8;
		}
		@media (prefers-reduced-motion: reduce) {
			.lk-side.folded .sbtog :is(.pn, .mk) {
				transition: none;
			}
		}
		.lk-side.folded .si {
			position: relative;
			justify-content: center;
			min-height: 40px;
			padding: 0;
		}
		.lk-side.folded .si .lab {
			flex: 0 0 auto;
			justify-content: center;
			gap: 0;
		}
		.lk-side.folded .si .lab > svg {
			width: 18px;
			height: 18px;
		}
		.lk-side.folded :is(.txt, .cv2, .menu-cv) {
			display: none;
		}
		.lk-side.folded .nbadge {
			position: absolute;
			top: 6px;
			right: 12px;
			width: 8px;
			min-width: 8px;
			height: 8px;
			padding: 0;
			border-radius: 50%;
			font-size: 0;
		}
		.lk-side.folded .pjb {
			min-height: 44px;
		}
		.lk-side.folded .si.on {
			box-shadow: inset 3px 0 0 var(--color-blue);
		}

		/* A phone: the navigation hides, the top bar's Menu opens it over the page (criterion d5c9c712). */
		.lk-side-scrim {
			display: none;
		}
		@media (max-width: 980px) {
			.lk-side {
				display: none;
			}
			.lk-side.open {
				position: fixed;
				inset: 0 auto 0 0;
				z-index: 44;
				display: flex;
				width: 264px;
				box-shadow: 6px 0 0 var(--color-orange);
			}
			.lk-side .sbtog {
				display: none;
			}
			.lk-side-scrim {
				position: fixed;
				inset: 0;
				z-index: 43;
				display: block;
				border: 0;
				background: rgb(17 17 20 / 0.35);
				cursor: pointer;
			}
		}
	}
</style>
