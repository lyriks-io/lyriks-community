<script lang="ts">
	import { textPieces } from '$lib/domain/evolution';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';

	/**
	 * A text of the Functional spec as it reads: prose, its glossary words marked
	 * (ac-glos-underline-only), and each citation as a chip that opens the element
	 * (ac-evo-func-mention). A citation whose element is gone, or not resolved
	 * yet, reads as its plain name, never as a dead link.
	 */
	interface Props {
		text: string;
		/** The cited elements that still exist, by ref. */
		links?: Readonly<Record<string, { readonly href: string | null }>>;
	}
	let { text, links = {} }: Props = $props();
	const pieces = $derived(textPieces(text));
</script>

<span class="whitespace-pre-line">{#each pieces as piece, i (i)}{#if piece.kind === 'text'}<GlossaryText text={piece.text} />{:else if links[piece.ref]?.href}<a
				href={links[piece.ref].href}
				class="rounded-sm bg-blue-tint px-1 font-semibold text-blue-ink hover:underline"
				onclick={(e) => e.stopPropagation()}>@{piece.name}</a
			>{:else}{piece.name}{/if}{/each}</span>
