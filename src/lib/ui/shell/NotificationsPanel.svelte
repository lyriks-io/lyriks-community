<script lang="ts">
	import { goto } from '$app/navigation';
	import { NOTIFICATION_DAYS, notificationDay, notificationPlace, timeAgo, type BellNotification } from './notification-view';
	import { markRead, readHere } from './notification-reads.svelte';
	import { shell } from './shell-state.svelte';
	import SectionMark from './SectionMark.svelte';
	import SidePanel from './SidePanel.svelte';
	import SideIcon from './SideIcon.svelte';

	/**
	 * The notifications (criterion c12b625e, actions 014f7786, 270be9b2,
	 * a51ae1af, e4117c6a): a panel beside the navigation listing what concerns
	 * the reader across their projects, newest first under Today, Yesterday and
	 * Earlier, on the Unread ones or All. Each is one row of the design v4
	 * (criterion 65fdff0a): the mark of its section, its project and when, what
	 * happened, its line; a read one fades (criterion 88ed514a). Opening one
	 * marks it read and goes where it happened; Mark all as read every one. A
	 * mark reads at once, in the list and in the count, and is saved behind; a
	 * refusal puts it back with a message.
	 */
	let { items }: { items: BellNotification[] } = $props();

	const open = $derived(shell.panel === 'notifications');
	let filter = $state<'unread' | 'all'>('unread');
	$effect(() => {
		if (open) filter = 'unread';
	});

	const unread = (n: BellNotification) => n.unread && !readHere(n.id);
	const count = $derived(items.filter(unread).length);
	const shown = $derived(filter === 'all' ? items : items.filter(unread));
	const groups = $derived(NOTIFICATION_DAYS.map((day) => ({ day, items: shown.filter((n) => notificationDay(n.at) === day) })).filter((g) => g.items.length > 0));

	function mark(ids: string[] | 'all') {
		const all = ids === 'all';
		return markRead(all ? items.filter(unread).map((n) => n.id) : ids, () => items, all);
	}

	function go(n: BellNotification) {
		shell.close();
		if (unread(n)) void mark([n.id]);
		void goto(n.href);
	}
</script>

<SidePanel {open} label="Notifications" onclose={() => shell.close()}>
	{#snippet head()}
		<SideIcon name="bell" />
		<strong class="ntt">Notifications</strong>
	{/snippet}
	<div class="ntb" role="group" aria-label="Show">
		<button type="button" class="tb" class:on={filter === 'unread'} aria-pressed={filter === 'unread'} onclick={() => (filter = 'unread')}>Unread · {count}</button>
		<button type="button" class="tb" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
		<button type="button" class="mrk" disabled={count === 0} onclick={() => mark('all')}>Mark all as read</button>
	</div>
	{#each groups as g (g.day)}
		<div class="gh" role="presentation">{g.day}</div>
		{#each g.items as n (n.id)}
			{@const isUnread = unread(n)}
			{@const place = notificationPlace(n.where)}
			<!-- One row of the design v4: the whole row opens where it happened (criterion 65fdff0a). -->
			<button type="button" class="nr" class:un={isUnread} onclick={() => go(n)}>
				<SectionMark section={place.section} faded={!isUnread} />
				<span class="tx">
					<span class="c"><b>{place.project}</b><span>{timeAgo(n.at)}</span></span>
					{#if isUnread}<span class="sr-only">Unread:</span>{/if}
					<strong>{n.title}</strong>
					{#if n.line}<span class="l">{n.line}</span>{/if}
				</span>
			</button>
		{/each}
	{:else}
		<p class="e">{filter === 'unread' ? 'You are up to date. Nothing unread.' : 'No notification yet.'}</p>
	{/each}
</SidePanel>

<style>
	/* The design v4's notifications panel (.ntp, .ntp-tabs, .nr). */
	:global {
		.lk-pal .ntt {
			flex: 1;
			color: var(--color-ink);
			font-size: 1.0625rem;
		}
		.lk-pal .ntb {
			position: sticky;
			top: -4px;
			z-index: 1;
			display: flex;
			align-items: center;
			gap: 20px;
			min-height: 40px;
			margin-top: -4px;
			padding: 0 18px;
			border-bottom: 1px solid var(--color-line);
			background: var(--color-paper);
		}
		.lk-pal .ntb .tb {
			padding: 12px 2px;
			border: 0;
			border-bottom: 3px solid transparent;
			background: none;
			color: var(--color-ink-3);
			font: 600 0.78125rem/1.2 var(--font-evo);
			white-space: nowrap;
			cursor: pointer;
		}
		.lk-pal .ntb .tb.on {
			border-bottom-color: var(--color-ink);
			color: var(--color-ink);
		}
		.lk-pal .ntb .mrk {
			margin-left: auto;
			padding: 0;
			border: 0;
			background: none;
			color: var(--color-ink);
			font-size: 0.75rem;
			text-decoration: underline;
			text-underline-offset: 3px;
			cursor: pointer;
		}
		.lk-pal .ntb .mrk:disabled {
			color: var(--color-ink-4);
			text-decoration: none;
			cursor: default;
		}
		.lk-pal .gh {
			padding: 16px 18px 6px;
			color: var(--color-ink-3);
			font: 600 0.65625rem/1.3 var(--font-evo-mono);
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}
		.lk-pal .nr {
			display: grid;
			grid-template-columns: 24px minmax(0, 1fr);
			gap: 12px;
			box-sizing: border-box;
			width: 100%;
			padding: 12px 18px 12px 15px;
			border: 0;
			border-top: 1px solid var(--color-line);
			border-left: 3px solid transparent;
			background: transparent;
			color: var(--color-ink);
			font-family: inherit;
			text-align: left;
			cursor: pointer;
		}
		.lk-pal .gh + .nr {
			border-top: 0;
		}
		.lk-pal .nr:hover {
			background: var(--color-toner-1);
		}
		/* Unread: a warm tone and a blue edge; read: neither, and its texts in grey (criterion 88ed514a). */
		.lk-pal .nr.un {
			border-left-color: var(--color-blue);
			background: var(--color-toner-1);
		}
		.lk-pal .nr .tx {
			display: block;
			min-width: 0;
		}
		.lk-pal .nr .c {
			display: flex;
			justify-content: space-between;
			gap: 8px;
			color: var(--color-ink-3);
			font: 400 0.6875rem/1.3 var(--font-evo-mono);
		}
		.lk-pal .nr .c b {
			overflow: hidden;
			color: var(--color-ink);
			font-weight: 700;
			text-overflow: ellipsis;
			text-transform: uppercase;
			white-space: nowrap;
		}
		.lk-pal .nr strong {
			display: block;
			margin: 3px 0;
			font-size: 0.875rem;
			line-height: 1.3;
		}
		.lk-pal .nr .l {
			display: block;
			color: var(--color-ink-2);
			font-size: 0.8125rem;
			line-height: 1.4;
		}
		.lk-pal .nr:not(.un) :is(strong, .l, .c b) {
			color: var(--color-ink-3);
		}
		.lk-pal .nr:not(.un) strong {
			font-weight: 600;
		}
		.lk-pal .e {
			margin: 8px 18px;
			color: var(--color-ink-3);
			font-size: 0.875rem;
		}
	}
</style>
