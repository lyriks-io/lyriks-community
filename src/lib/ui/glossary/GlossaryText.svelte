<script lang="ts">
	import type { GlossaryTerm } from '$domain/glossary';
	import type { VariableHint } from '$domain/rules';
	import { earsKeywordSpans, earsRunsWithin } from '$domain/rules';
	import { EARS_KEYWORD } from './ears-look';
	import { getGlossaryTerms } from './glossary-context';
	import GlossaryMark from './GlossaryMark.svelte';
	import VariableMark from './VariableMark.svelte';
	import { variableSegments } from './variable-segments';

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
		/**
		 * The text is a requirement written in EARS notation: its keywords, in
		 * English or in French, stand out (`EARS_KEYWORD`) outside the governed words and
		 * outside what it quotes (5b984e4a). Off by default.
		 */
		ears?: boolean;
		/** Positions supplied by the canonical server projector, never guessed from prose. */
		variables?: readonly VariableHint[];
	}
	let { text, class: cls = '', terms, onFix, ears = false, variables = [] }: Props = $props();

	const provided = getGlossaryTerms();
	const segments = $derived(text ? variableSegments(text, terms ?? provided(), variables) : []);
	// Read on the whole sentence, so a quotation a governed word splits stays plain.
	const spans = $derived(ears && text ? earsKeywordSpans(text) : []);
</script>

<span class={cls}>
	{#each segments as seg, i (i)}
		{#if seg.identifiers}
			<VariableMark text={seg.text} identifiers={seg.identifiers} definitions={seg.definitions}>
				{#if ears}{#each earsRunsWithin(seg.text, seg.offset, spans) as run, j (j)}{#if run.keyword}<strong class={EARS_KEYWORD}>{run.text}</strong>{:else}{run.text}{/if}{/each}{:else}{seg.text}{/if}
			</VariableMark>
		{:else if seg.mark}
			<GlossaryMark
				text={seg.text}
				mark={seg.mark}
				onFix={onFix ? (canonical) => onFix({ original: seg.text, canonical }) : undefined}
			/>
		{:else if ears}
			{#each earsRunsWithin(seg.text, seg.offset, spans) as run, j (j)}{#if run.keyword}<strong class={EARS_KEYWORD}>{run.text}</strong>{:else}{run.text}{/if}{/each}
		{:else}
			{seg.text}
		{/if}
	{/each}
</span>
