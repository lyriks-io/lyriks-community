<script lang="ts">
	import { segmentText, type GlossaryTerm } from '$domain/glossary';
	import { getGlossaryTerms } from './glossary-context';
	import GlossaryMark from './GlossaryMark.svelte';

	interface Props {
		/** The display string to decorate. Governed words gain a hover definition. */
		text: string | null | undefined;
		/** Optional class for the transparent wrapper (e.g. to keep truncation). */
		class?: string;
		/** Override the provided vocabulary (e.g. live, unsaved terms on the editor). */
		terms?: GlossaryTerm[];
		/**
		 * Optional remediation. When set, each governed (non-canonical) word offers
		 * a tooltip button that reports the occurrence so the owning editor can
		 * replace it with the canonical term in its underlying value.
		 */
		onFix?: (occurrence: { original: string; canonical: string }) => void;
	}
	let { text, class: cls = '', terms, onFix }: Props = $props();

	const provided = getGlossaryTerms();
	const segments = $derived(text ? segmentText(text, terms ?? provided()) : []);
</script>

<span class={cls}>
	{#each segments as seg, i (i)}
		{#if seg.mark}
			<GlossaryMark
				text={seg.text}
				mark={seg.mark}
				onFix={onFix ? (canonical) => onFix({ original: seg.text, canonical }) : undefined}
			/>
		{:else}
			{seg.text}
		{/if}
	{/each}
</span>
