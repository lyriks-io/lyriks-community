<script lang="ts">
	import { usePageScope } from './page-scope.svelte';

	/**
	 * What one page (the Overview, a core feature, a feature, an action) is
	 * validated on, handed to the band at the top of Knowledge, where its
	 * validation reads while the page shows (criterion f480783f, owner
	 * 2026-11-07: 'autre option, on le fusionne avec la barre du haut DRAFT').
	 * It draws nothing of its own: the band says what the page asks of the
	 * reader, its gauge and the reader's own validations, and stays in view
	 * while the page scrolls.
	 */
	interface Props {
		anchors: readonly string[];
		/** The block the view moves on from once the reader validated theirs. */
		sectionId: string;
		/** What the band is named for a screen reader while the page shows. */
		kicker?: string;
	}
	let { anchors, sectionId, kicker = 'Validation of this feature' }: Props = $props();
	const slot = usePageScope();

	$effect(() => slot?.hold({ anchors, sectionId, label: kicker.toLowerCase() }));
</script>
