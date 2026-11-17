<script lang="ts">
	import { readsAsEars } from '$domain/rules';
	import GlossaryText from './GlossaryText.svelte';
	import type { VariableHint } from '$domain/rules';

	/**
	 * A display string that may be a requirement in EARS notation. When it reads
	 * as one, its keywords (While, When, Where, If, then, shall) stand out; its
	 * glossary words are marked like any running text a person reads
	 * (ac-glos-underline-only). An inline span, so it drops into an existing
	 * element without changing its layout.
	 */
	interface Props {
		text: string | null | undefined;
		variables?: readonly VariableHint[];
	}
	let { text, variables = [] }: Props = $props();
</script>

<GlossaryText {text} {variables} ears={!!text && readsAsEars(text)} />
