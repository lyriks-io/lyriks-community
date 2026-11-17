<script lang="ts">
	import { matrixLines, type MatrixGroup, type MatrixLine } from '$application/spec360/users';
	import { VirtualList } from '$ui/design-system';
	import { columnWindow } from './column-window';
	import type { PermissionTicks } from './permission-ticks.svelte';

	/**
	 * The table of who can do what on its own page (criterion 5787390d): the
	 * ACTION column and one column per user, each action under the line of its
	 * core feature and feature, one cell per user and action, green when the
	 * user can perform it and grey when not. Its header of users and its column
	 * of actions stay in view while it scrolls both ways in its own box, every
	 * user column keeps one width, and only the lines and the user columns in
	 * view are drawn. While a draft, a cell is ticked in place (criterion
	 * eba33558).
	 */
	interface Props {
		users: readonly { readonly id: string; readonly name: string; readonly userClass: 'end' | 'admin' }[];
		groups: readonly MatrixGroup[];
		ticks: PermissionTicks;
		tickable: boolean;
		/** Where a user's name in the header leads. */
		hrefOf: (userId: string) => string;
		/** Sizes the scroll box. */
		class?: string;
	}
	let { users, groups, ticks, tickable, hrefOf, class: klass = '' }: Props = $props();

	const lines = $derived(matrixLines(groups));
	// Only the user columns in view are drawn, two spacers standing for the others (criterion 5787390d).
	const COLUMN = 84;
	const NAMES = 260;
	let view = $state({ left: 0, width: 1600 });
	const span = $derived(columnWindow(view.left, view.width, users.length, COLUMN, NAMES));
	const drawn = $derived(users.slice(span.start, span.end));
	// A few users share the card's width; past what fits, each column keeps its width and the table scrolls.
	const fits = $derived(NAMES + users.length * COLUMN <= view.width);
	const grid = $derived(
		fits
			? `grid-template-columns: min(${NAMES}px, 45vw) 0px repeat(${users.length}, minmax(${COLUMN}px, 1fr)) 0px`
			: `grid-template-columns: min(${NAMES}px, 45vw) ${span.start * COLUMN}px repeat(${drawn.length}, ${COLUMN}px) ${(users.length - span.end) * COLUMN}px`
	);
	function follow(scroller: HTMLElement) {
		const read = () => (view = { left: scroller.scrollLeft, width: scroller.clientWidth });
		const sizes = new ResizeObserver(read);
		sizes.observe(scroller);
		scroller.addEventListener('scroll', read, { passive: true });
		read();
		return () => {
			sizes.disconnect();
			scroller.removeEventListener('scroll', read);
		};
	}
	const pinned = 'sticky left-0 self-stretch bg-surface pl-[18px] pr-3 shadow-[1px_0_0_var(--color-evo-line-soft)]';
	const MONO = 'font-evo-mono text-xs tracking-[0.08em] text-evo-muted uppercase';
</script>

<div class="overflow-auto overscroll-contain rounded-evo-card border border-evo-line bg-surface {klass}" {@attach follow}>
	<div class="w-max min-w-full">
		<div class="sticky top-0 z-2 grid w-max min-w-full items-end border-b-[1.5px] border-ink bg-surface pt-2.5 pb-2.5" style={grid}>
			<span class="{pinned} z-3 flex items-end {MONO}">ACTION</span>
			<span aria-hidden="true"></span>
			{#each drawn as u (u.id)}
				<a
					href={hrefOf(u.id)}
					class="line-clamp-3 px-1.5 text-center text-[0.6875rem] leading-[1.35] font-semibold wrap-break-word text-evo-ink-2 no-underline hover:text-evo-ink hover:underline"
					title="{u.name}{u.userClass === 'admin' ? ' (admin user)' : ''}: see what this user can do">{u.name}</a
				>
			{/each}
			<span aria-hidden="true"></span>
		</div>
		<VirtualList items={lines} key={(l: MatrixLine) => l.key} estimate={(l: MatrixLine) => (l.kind === 'group' ? 40 : 41)}>
			{#snippet children(line: MatrixLine)}
				{#if line.kind === 'group'}
					<div class="sticky left-0 w-fit max-w-[min(560px,80vw)] bg-surface pt-4 pb-1.5 pl-[18px] {MONO}">{line.heading}</div>
				{:else}
					{@const row = line.row}
					<div class="grid w-max min-w-full items-center border-t border-evo-line-soft" style={grid}>
						<span class="{pinned} z-1 py-2 text-sm leading-[1.45]">{row.action}</span>
						<span aria-hidden="true"></span>
						{#each drawn as u (u.id)}
							{@const ok = ticks.holds(u.id, row)}
							{@const label = `${ok ? 'Allowed' : 'Restricted'} · ${u.name} · ${row.action}`}
							{@const cell = `block h-[18px] w-[26px] border transition-colors duration-150 ${ok ? 'border-green bg-green' : 'border-toner-2 bg-toner-2'}`}
							{#if tickable}
								<button
									type="button"
									title="{label} · click to {ok ? 'take it back' : 'grant it'}"
									aria-label="{label}: {ok ? 'take it back' : 'grant it'}"
									aria-pressed={ok}
									class="group/cell grid h-9 w-11 cursor-pointer place-items-center justify-self-center rounded-lg border-0 bg-transparent p-0 hover:bg-evo-hover"
									onclick={() => void ticks.tick(u.id, row.capabilityId, !ok)}
									><span aria-hidden="true" class="{cell} group-hover/cell:border-ink"></span></button
								>
							{:else}
								<span role="img" title={label} aria-label={label} class="{cell} justify-self-center"></span>
							{/if}
						{/each}
						<span aria-hidden="true"></span>
					</div>
				{/if}
			{/snippet}
		</VirtualList>
	</div>
</div>
