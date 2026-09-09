<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { CoreTone } from '$domain/features';

	interface Props {
		coreId: string;
		tone: CoreTone;
		/** Receives the trimmed name; the parent should immediately persist it. */
		onAdd: (name: string) => void;
	}
	let { tone, onAdd }: Props = $props();

	let value = $state('');

	const BG: Record<CoreTone, string> = {
		customer: 'border-info-200 hover:border-info-300 focus-within:border-info-400 bg-info-50/30',
		engagement: 'border-info-200 hover:border-info-300 focus-within:border-info-400 bg-info-50/30',
		invoicing: 'border-brand-200 hover:border-brand-300 focus-within:border-brand-400 bg-brand-50/30',
		content: 'border-brand-200 hover:border-brand-300 focus-within:border-brand-400 bg-brand-50/30',
		payment: 'border-danger-200 hover:border-danger-300 focus-within:border-danger-400 bg-danger-50/30',
		commerce: 'border-danger-200 hover:border-danger-300 focus-within:border-danger-400 bg-danger-50/30',
		dunning: 'border-warning-200 hover:border-warning-300 focus-within:border-warning-400 bg-warning-50/30',
		operations: 'border-warning-200 hover:border-warning-300 focus-within:border-warning-400 bg-warning-50/30',
		reporting: 'border-success-200 hover:border-success-300 focus-within:border-success-400 bg-success-50/30',
		insight: 'border-success-200 hover:border-success-300 focus-within:border-success-400 bg-success-50/30',
		custom: 'border-line hover:border-line-strong focus-within:border-brand-400 bg-surface-sunken/40'
	};

	const ICON_TONE: Record<CoreTone, string> = {
		customer: 'text-info-500',
		engagement: 'text-info-500',
		invoicing: 'text-brand-500',
		content: 'text-brand-500',
		payment: 'text-danger-500',
		commerce: 'text-danger-500',
		dunning: 'text-warning-500',
		operations: 'text-warning-500',
		reporting: 'text-success-500',
		insight: 'text-success-500',
		custom: 'text-ink-500'
	};

	function commit() {
		const name = value.trim();
		if (name.length === 0) return;
		onAdd(name);
		value = '';
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit();
		}
	}

	/**
	 * Auto-commit when the user finishes the first word (types a space after
	 * non-whitespace characters). Keeps the second-word-and-onwards typing for
	 * the NEXT feature, so "Issue invoice Credit note" becomes 3 leaves in 3
	 * Enters OR seamlessly via the space heuristic.
	 *
	 * We only auto-commit on the FIRST space when the user has typed exactly
	 * one word — otherwise we'd fight long names like "Two-factor auth".
	 */
	function onInput(e: Event) {
		const next = (e.currentTarget as HTMLInputElement).value;
		value = next;
		// Heuristic: the user just typed a trailing space after a single word.
		// We let multi-word names through by only firing when the input ends in
		// exactly ONE space and contains no other whitespace.
		if (
			next.length >= 2 &&
			next.endsWith(' ') &&
			next.trim().split(/\s+/).length === 1
		) {
			// Defer: gives the user a tick to type more (e.g. "Issue " then "invoice")
			// before we auto-commit. If they type within ~220 ms, the timer is
			// cancelled. If they pause, we commit.
			scheduleAutoCommit(next.trim());
		}
	}

	let autoCommitTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleAutoCommit(candidate: string) {
		if (autoCommitTimer) clearTimeout(autoCommitTimer);
		autoCommitTimer = setTimeout(() => {
			// Only commit if the user hasn't typed more since.
			if (value.trim() === candidate && value.endsWith(' ')) {
				onAdd(candidate);
				value = '';
			}
			autoCommitTimer = null;
		}, 220);
	}
</script>

<label
	class="flex w-full items-center gap-2 rounded-field border-2 border-dashed px-3 py-2 text-sm transition-colors {BG[
		tone
	]}"
>
	<Icon name="plus" size={13} class={ICON_TONE[tone]} />
	<input
		type="text"
		{value}
		oninput={onInput}
		onkeydown={onKeyDown}
		placeholder="Type a feature name + Enter"
		class="flex-1 border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:outline-none"
	/>
	{#if value.trim().length > 0}
		<button
			type="button"
			onclick={commit}
			class="rounded-pill bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-brand-600"
			title="Press Enter"
		>
			Add
		</button>
	{/if}
</label>
