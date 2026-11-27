<script lang="ts">
	import { tick } from 'svelte';
	import { Icon } from '$ui/design-system';

	/**
	 * All projects ▾ above Home's feed (feat-home, criterion 9d847801, action
	 * 0b9581a7): the projects that have cards, A to Z, each with its count and a
	 * box; ticking limits the feed to the projects ticked, All projects clears
	 * them. The arrow keys move in the menu, Escape closes it and gives the focus
	 * back to the button, Tab or a click outside closes it.
	 */
	interface Props {
		projects: readonly { readonly projectId: string; readonly name: string; readonly count: number }[];
		picked: ReadonlySet<string>;
		ontoggle: (projectId: string) => void;
		onall: () => void;
	}
	let { projects, picked, ontoggle, onall }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let button = $state<HTMLButtonElement>();

	// The room the menu takes under its button: what the window has left below it, less a margin, and never fewer
	// than a few rows. A list longer than that scrolls inside the menu, so its last project is always in reach.
	const EDGE_PX = 12;
	const FEWEST_PX = 160;
	let room = $state<number>();

	function measure() {
		if (button) room = Math.max(FEWEST_PX, Math.round(window.innerHeight - button.getBoundingClientRect().bottom - EDGE_PX));
	}

	// Measured again while it is open: the window resized, or the page scrolled under it (the app's scroller, captured).
	$effect(() => {
		if (!open) return;
		measure();
		window.addEventListener('resize', measure);
		document.addEventListener('scroll', measure, { capture: true, passive: true });
		return () => {
			window.removeEventListener('resize', measure);
			document.removeEventListener('scroll', measure, { capture: true });
		};
	});

	const label = $derived(
		picked.size === 0 ? 'All projects' : picked.size === 1 ? (projects.find((p) => picked.has(p.projectId))?.name ?? '1 project') : `${picked.size} projects`
	);

	async function toggle() {
		open = !open;
		if (!open) return;
		await tick();
		root?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.focus();
	}

	function close(focusButton: boolean) {
		open = false;
		if (focusButton) button?.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		const items = [...(root?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])];
		const at = items.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			close(true);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			items[(at + 1) % items.length]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			items[(at - 1 + items.length) % items.length]?.focus();
		} else if (e.key === 'Tab') {
			close(false);
		}
	}

	function onoutside(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) close(false);
	}
</script>

<svelte:window onpointerdown={onoutside} />

<div class="pf" bind:this={root}>
	<button type="button" class="pf-b" class:on={picked.size > 0} bind:this={button} aria-haspopup="menu" aria-expanded={open} onclick={() => void toggle()}>
		<Icon name="filter" size={14} />
		<span>{label}</span>
		<span aria-hidden="true">▾</span>
	</button>
	{#if open}
		<div class="pf-m" role="menu" aria-label="Filter by project" tabindex="-1" style:--pf-room={room === undefined ? undefined : `${room}px`} {onkeydown}>
			<button type="button" class="pf-o" role="menuitemcheckbox" aria-checked={picked.size === 0} onclick={onall}>
				<i class="pf-x" class:on={picked.size === 0}></i><span class="nm">All projects</span>
			</button>
			{#each projects as p (p.projectId)}
				<button type="button" class="pf-o" role="menuitemcheckbox" aria-checked={picked.has(p.projectId)} onclick={() => ontoggle(p.projectId)}>
					<i class="pf-x" class:on={picked.has(p.projectId)}></i><span class="nm">{p.name}</span><em>{p.count}</em>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* The design's project filter (.pf). */
	.pf {
		position: relative;
	}
	.pf-b {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 4px 0 0;
		border: 0;
		background: none;
		color: var(--hm-muted);
		font: 400 0.875rem/1 var(--font-evo);
		cursor: pointer;
	}
	.pf-b:hover {
		color: var(--color-ink);
	}
	.pf-b.on {
		color: var(--color-blue-ink);
		font-weight: 600;
	}
	.pf-m {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 46;
		min-width: 260px;
		max-height: min(420px, var(--pf-room, 70vh));
		padding: 4px 0;
		overflow-y: auto;
		/* The wheel scrolls the list alone: reaching its end, or a list too short to scroll, never carries the page
		   (and the open menu with it) away. */
		overscroll-behavior: contain;
		border: 1.5px solid var(--color-ink);
		background: var(--hm-paper);
		box-shadow: 5px 5px 0 var(--color-ink);
	}
	.pf-o {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 11px 14px;
		border: 0;
		background: none;
		color: var(--color-ink);
		font: 400 0.875rem/1.2 var(--font-evo);
		text-align: left;
		cursor: pointer;
	}
	.pf-o:hover,
	.pf-o:focus {
		background: var(--hm-card);
		outline: none;
	}
	.pf-o .nm {
		flex: 1;
	}
	.pf-o em {
		color: var(--hm-muted);
		font: normal 0.75rem/1 var(--font-evo-mono);
	}
	.pf-x {
		display: inline-block;
		flex: 0 0 14px;
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--color-ink);
	}
	.pf-x.on {
		border-color: var(--color-blue-ink);
		background: var(--color-blue-ink);
	}
</style>
