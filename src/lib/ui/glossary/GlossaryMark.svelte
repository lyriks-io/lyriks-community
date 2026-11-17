<script lang="ts">
	import Icon from '$ui/design-system/Icon.svelte';
	import type { Mark } from '$domain/glossary';
	import { leaveTheStage, takeTheStage } from '$ui/shell/one-card';

	interface Props {
		text: string;
		mark: Mark;
		/**
		 * Optional remediation: replace this occurrence with the canonical term.
		 * When provided (and the word isn't already canonical), the tooltip gains a
		 * "use the canonical term" button.
		 */
		onFix?: (canonical: string) => void;
	}
	let { text, mark, onFix }: Props = $props();

	let open = $state(false);
	let x = $state(0);
	let y = $state(0);
	let anchor: HTMLElement;
	// Small close delay so the cursor can travel the gap from the word up to the
	// tooltip (which hosts the Fix button) without it vanishing mid-move.
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	// Fixed-position, body-portalled tooltip so it can never be clipped by a
	// truncating / overflow-hidden ancestor (feature names, cards, scroll panes).
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	// One card at a time: another card opening closes this one at once.
	function closeNow() {
		if (closeTimer) clearTimeout(closeTimer);
		open = false;
		leaveTheStage(closeNow);
	}
	function show() {
		if (closeTimer) clearTimeout(closeTimer);
		const r = anchor.getBoundingClientRect();
		x = r.left + r.width / 2;
		y = r.top;
		takeTheStage(closeNow);
		open = true;
	}
	function scheduleHide() {
		if (closeTimer) clearTimeout(closeTimer);
		closeTimer = setTimeout(closeNow, 120);
	}
	function keepOpen() {
		if (closeTimer) clearTimeout(closeTimer);
	}

	const canFix = $derived(!!onFix && mark.kind !== 'canonical');
	function applyFix() {
		onFix?.(mark.canonical);
		closeNow();
	}

	const tone = $derived(
		mark.kind === 'canonical'
			? { line: 'decoration-brand-400', icon: 'text-brand-500', label: 'Canonical term', labelCls: 'text-brand-600' }
			: mark.kind === 'allowed'
				? { line: 'decoration-ink-300', icon: 'text-ink-400', label: 'Allowed synonym', labelCls: 'text-ink-500' }
				: { line: 'decoration-danger-400', icon: 'text-danger-500', label: 'Avoid - use instead', labelCls: 'text-danger-600' }
	);
</script>

<!-- The underline alone marks the word (dotted for a term, dashed red for a
     word to avoid): an icon beside it broke the rhythm of every sentence. The
     card on hover says the rest. -->
<span
	bind:this={anchor}
	role="button"
	tabindex="0"
	aria-label={`${tone.label}: ${mark.canonical}`}
	onmouseenter={show}
	onmouseleave={scheduleHide}
	onfocus={show}
	onblur={scheduleHide}
	class="gloss-mark cursor-help underline decoration-dotted underline-offset-2 outline-none {tone.line} {mark.kind ===
	'banned'
		? 'decoration-dashed'
		: ''}"
>{text}</span><!-- No whitespace here: it would render as a space before the punctuation that follows the word. -->{#if open}
	<span
		use:portal
		role="tooltip"
		onmouseenter={keepOpen}
		onmouseleave={scheduleHide}
		class="fixed z-120 w-max max-w-xs rounded-card border border-line bg-surface px-3 py-2 text-left shadow-card {canFix
			? ''
			: 'pointer-events-none'}"
		style="left:{x}px; top:{y}px; transform: translate(-50%, calc(-100% - 8px));"
	>
		<span class="mb-1 flex items-center gap-1.5">
			<Icon name={mark.kind === 'banned' ? 'info' : 'book'} size={12} class={tone.icon} />
			<span class="text-[0.625rem] font-bold uppercase tracking-[0.12em] {tone.labelCls}">{tone.label}</span>
		</span>
		<span class="block text-[0.8125rem] font-semibold text-ink-900">{mark.canonical}</span>
		{#if mark.definition.trim()}
			<span class="mt-0.5 block text-[0.6875rem] leading-snug text-ink-500">{mark.definition}</span>
		{/if}
		{#if mark.kind === 'allowed'}
			<span class="mt-1 block text-[0.625rem] text-ink-400">Accepted, but prefer the canonical term.</span>
		{:else if mark.kind === 'banned'}
			<span class="mt-1 block text-[0.625rem] text-danger-600">A word to avoid: this product says the term above.</span>
		{/if}
		{#if canFix}
			<button
				type="button"
				onclick={applyFix}
				class="mt-2 inline-flex items-center gap-1 rounded-field bg-brand-500 px-2 py-1 text-[0.6875rem] font-semibold text-white transition hover:bg-brand-600"
			>
				<Icon name="check" size={11} /> Use “{mark.canonical}”
			</button>
		{/if}
	</span>
{/if}
