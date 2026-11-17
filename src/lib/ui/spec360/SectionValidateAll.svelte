<script lang="ts">
	import ValidateAllCheck from './ValidateAllCheck.svelte';
	import { useEdits } from './edits.svelte';
	import { useValidation } from './validation.svelte';

	/**
	 * "Validate all" for one section of a page: validates, in the reader's name
	 * and in one batch, every element of the section still waiting on them (a
	 * rejection stays an explicit decision and is left out), as the check of the
	 * four acts with its count (criterion aba60be7). Hidden once nothing of the
	 * section waits on them.
	 */
	interface Props {
		/** The anchors of the section's elements, in page order. */
		anchors: readonly string[];
		/** How the section names its elements, plural. */
		what: string;
		/** The section's container: the view moves on from it. */
		sectionId: string;
		/** Shown at rest: where the section is the only place its elements are validated (the Overview's frames). */
		always?: boolean;
	}
	let { anchors, what, sectionId, always = false }: Props = $props();
	const validation = useValidation();
	const edits = useEdits();
	const open = $derived(edits.notEditing(anchors));
	// One's own validation needs no editing right (criterion 43bef20d): the server checks the assignment when it is sent.
	const count = $derived(validation.waitingOnMe(open).length);
</script>

<ValidateAllCheck {count} {what} {always} onclick={() => void validation.validateAll(open, sectionId)} />
