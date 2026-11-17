<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * A "?" help affordance: a small circular button that opens a didactic popover
	 * explaining WHAT a page/tab is for, HOW to use it, and WHY it matters. Content
	 * is structured (not free HTML) so every explanation reads the same way. The
	 * popover is body-portalled + fixed-positioned, so it never gets clipped by a
	 * card/overflow ancestor, and closes on Escape, outside-click or the ✕.
	 */
	interface Props {
		/** Short heading — usually the page/tab name. */
		title: string;
		/** One or two plain sentences: what this is for. */
		what: string;
		/** Optional step-by-step "how to use it" bullets. */
		how?: string[];
		/** Optional "why it matters" note — the enterprise cost/quality angle. */
		value?: string;
		/** Accessible label for the trigger (defaults to `Help: <title>`). */
		label?: string;
		/**
		 * `inline` — a small brand-tinted "?" chip next to a title (default).
		 * `page` — the page-level affordance in a PageHeading's top-right corner:
		 *   a round white button on the page background, sized to balance the
		 *   heading rather than to fit a toolbar.
		 */
		variant?: 'inline' | 'page';
		class?: string;
	}
	let { title, what, how = [], value, label, variant = 'inline', class: klass = '' }: Props = $props();

	let open = $state(false);
	let x = $state(0);
	let y = $state(0);
	let placeAbove = $state(false);
	let anchor = $state<HTMLButtonElement>();
	let popover = $state<HTMLElement>();

	const WIDTH = 320;

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function position() {
		if (!anchor) return;
		const r = anchor.getBoundingClientRect();
		const margin = 8;
		// Clamp horizontally so the panel stays fully on-screen — a corner button
		// sits near the right edge, so the panel opens leftward from there.
		x = Math.min(Math.max(margin, r.left), window.innerWidth - WIDTH - margin);
		// Prefer below the button; flip above when there isn't room.
		const belowRoom = window.innerHeight - r.bottom;
		placeAbove = belowRoom < 220 && r.top > belowRoom;
		y = placeAbove ? r.top - margin : r.bottom + margin;
	}

	function toggle() {
		open = !open;
		if (open) position();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			anchor?.focus();
		}
	}

	function onOutside(e: PointerEvent) {
		const t = e.target as Node;
		if (anchor?.contains(t) || popover?.contains(t)) return;
		open = false;
	}

	$effect(() => {
		if (!open) return;
		window.addEventListener('keydown', onKeydown);
		window.addEventListener('pointerdown', onOutside, true);
		window.addEventListener('resize', position);
		window.addEventListener('scroll', position, true);
		return () => {
			window.removeEventListener('keydown', onKeydown);
			window.removeEventListener('pointerdown', onOutside, true);
			window.removeEventListener('resize', position);
			window.removeEventListener('scroll', position, true);
		};
	});
</script>

{#if variant === 'page'}
	<button
		bind:this={anchor}
		type="button"
		onclick={toggle}
		aria-label={label ?? `Help: ${title}`}
		aria-expanded={open}
		aria-haspopup="dialog"
		title={`Help: ${title}`}
		class="grid size-9 shrink-0 place-items-center border-[1.5px] font-evo-mono text-base font-bold transition-colors {open
			? 'border-ink bg-ink text-paper'
			: 'border-line bg-transparent text-ink hover:border-ink'} {klass}"
	>
		?
	</button>
{:else}
	<button
		bind:this={anchor}
		type="button"
		onclick={toggle}
		aria-label={label ?? `Help: ${title}`}
		aria-expanded={open}
		aria-haspopup="dialog"
		class="grid size-5 shrink-0 place-items-center border-[1.5px] font-evo-mono text-[0.6875rem] font-bold leading-none transition-colors {open
			? 'border-ink bg-ink text-paper'
			: 'border-ink-3 bg-transparent text-ink hover:border-ink'} {klass}"
	>
		?
	</button>
{/if}

{#if open}
	<div
		bind:this={popover}
		use:portal
		role="dialog"
		aria-label={title}
		class="fixed z-[130] border-[1.5px] border-ink bg-paper p-4 text-left shadow-pop"
		style="left:{x}px; top:{y}px; width:{WIDTH}px; {placeAbove ? 'transform: translateY(-100%);' : ''}"
	>
		<div class="mb-1.5 flex items-start gap-2">
			<span class="grid size-6 shrink-0 place-items-center bg-blue-tint text-blue-ink">
				<Icon name="info" size={13} />
			</span>
			<h3 class="flex-1 pt-0.5 text-sm font-bold tracking-[-0.01em] text-ink">{title}</h3>
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label="Close help"
				class="shrink-0 p-0.5 text-ink-3 hover:bg-surface-sunken hover:text-ink"
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<p class="text-[0.78125rem] leading-relaxed text-ink-2">{what}</p>

		{#if how.length > 0}
			<p class="mt-3 font-evo-mono text-[0.6875rem] tracking-[0.08em] text-ink-3 uppercase">How to use it</p>
			<ul class="mt-1 space-y-1">
				{#each how as step, i (i)}
					<li class="flex gap-2 text-[0.75rem] leading-snug text-ink-2">
						<span
							class="mt-[3px] grid size-3.5 shrink-0 place-items-center bg-ink font-evo-mono text-[0.5rem] font-bold text-paper"
						>
							{i + 1}
						</span>
						<span>{step}</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if value}
			<div class="mt-3 flex gap-2 border-l-[6px] border-blue bg-blue-tint p-2.5">
				<Icon name="sparkles" size={13} class="mt-0.5 shrink-0 text-blue-ink" />
				<p class="text-[0.71875rem] leading-snug text-ink-2">
					<span class="font-semibold text-ink">Why it matters:</span>
					{value}
				</p>
			</div>
		{/if}
	</div>
{/if}
