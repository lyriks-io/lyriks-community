<script lang="ts">
	import { goto } from '$app/navigation';
	import { arrivals, timeAgo, TOAST_MS, TOASTS_SHOWN, type BellNotification } from './notification-view';
	import { markRead, readHere } from './notification-reads.svelte';
	import Logo from '$ui/design-system/Logo.svelte';
	import { Icon } from '$ui/design-system';

	/**
	 * A notification that arrives while the app is open, as a short card at the
	 * bottom right (criterion 31f7e46d of feat-feedback-docs): its mark, the
	 * project and how long ago, the same sentence as its card in the panel and
	 * one line naming the element. A click opens it and marks it read; it leaves
	 * after a few seconds, stays while the pointer or the keyboard rests on it,
	 * and closes on its button. What the list held when the app opened never
	 * shows here.
	 */
	let { items }: { items: BellNotification[] } = $props();

	interface Shown {
		readonly n: BellNotification;
		left: number;
		held: boolean;
	}
	let known: Set<string> | null = null;
	let shown = $state<Shown[]>([]);

	$effect(() => {
		const read = arrivals(known, items, (n) => n.unread && !readHere(n.id));
		known = read.known;
		if (read.arrived.length === 0) return;
		const fresh = read.arrived.filter((n) => !shown.some((s) => s.n.id === n.id)).map((n) => ({ n, left: TOAST_MS, held: false }));
		shown = [...fresh, ...shown].slice(0, TOASTS_SHOWN);
	});

	// One clock for every toast: each one counts down while nothing rests on it.
	const TICK = 250;
	$effect(() => {
		if (shown.length === 0) return;
		const timer = setInterval(() => {
			for (const s of shown) if (!s.held) s.left -= TICK;
			if (shown.some((s) => s.left <= 0)) shown = shown.filter((s) => s.left > 0);
		}, TICK);
		return () => clearInterval(timer);
	});

	const close = (id: string) => (shown = shown.filter((s) => s.n.id !== id));

	function open(n: BellNotification) {
		close(n.id);
		if (n.unread && !readHere(n.id)) void markRead([n.id], () => items);
		void goto(n.href);
	}
</script>

<div class="ntt-host" aria-live="polite" aria-label="New notifications">
	{#each shown as s (s.n.id)}
		{@const n = s.n}
		<div
			class="ntt-card"
			data-level={n.level}
			role="group"
			onmouseenter={() => (s.held = true)}
			onmouseleave={() => (s.held = false)}
			onfocusin={() => (s.held = true)}
			onfocusout={() => (s.held = false)}
		>
			<button type="button" class="ntt-open" onclick={() => open(n)}>
				{#if n.kind === 'lyriks'}
					<span class="who mark" aria-hidden="true"><Logo size={14} /></span>
				{:else if n.kind === 'alert'}
					<span class="who warn" aria-hidden="true"><Icon name="alert-triangle" size={13} /></span>
				{:else}
					<span class="who" style:background={n.color} aria-hidden="true">{n.initials}</span>
				{/if}
				<span class="tx">
					<span class="mt">{n.where.split(' · ')[0]} · {timeAgo(n.at)}</span>
					<strong>{n.title}</strong>
					<span class="ln">{n.line}</span>
				</span>
			</button>
			<button type="button" class="ntt-close" aria-label="Close" onclick={() => close(n.id)}><Icon name="x" size={13} /></button>
		</div>
	{/each}
</div>

<style>
	.ntt-host {
		position: fixed;
		right: 20px;
		bottom: calc(var(--app-foot-h, 0px) + 20px);
		z-index: 70;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(380px, calc(100vw - 40px));
		pointer-events: none;
	}
	.ntt-card {
		position: relative;
		display: flex;
		align-items: flex-start;
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
		box-shadow: 4px 4px 0 var(--color-ink);
		pointer-events: auto;
		animation: ntt-in 180ms ease-out;
	}
	.ntt-card[data-level='drift'] {
		border-color: var(--color-orange-ink);
		box-shadow: 4px 4px 0 var(--color-orange-ink);
	}
	.ntt-card[data-level='critical'] {
		border-color: var(--color-red-ink);
		box-shadow: 4px 4px 0 var(--color-red-ink);
	}
	.ntt-open {
		display: flex;
		flex: 1;
		gap: 10px;
		min-width: 0;
		padding: 12px 8px 12px 14px;
		border: 0;
		background: none;
		color: var(--color-ink);
		text-align: left;
		cursor: pointer;
	}
	.who {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		color: var(--color-paper);
		font: 700 0.5625rem/1 var(--font-evo-mono);
	}
	.who.mark {
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
		color: var(--color-ink);
	}
	.who.warn {
		border: 1.5px solid var(--color-orange-ink);
		background: var(--color-orange-tint);
		color: var(--color-orange-ink);
	}
	.tx {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.mt {
		overflow: hidden;
		color: var(--color-ink-3);
		font: 500 0.625rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.06em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.tx strong {
		font-size: 0.875rem;
		line-height: 1.3;
	}
	.ln {
		color: var(--color-ink-2);
		font-size: 0.8125rem;
		line-height: 1.4;
	}
	.ntt-close {
		flex: none;
		margin: 8px 8px 0 0;
		padding: 4px;
		border: 0;
		background: none;
		color: var(--color-ink-3);
		cursor: pointer;
	}
	.ntt-close:hover {
		color: var(--color-ink);
	}
	@keyframes ntt-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ntt-card {
			animation: none;
		}
	}
</style>
