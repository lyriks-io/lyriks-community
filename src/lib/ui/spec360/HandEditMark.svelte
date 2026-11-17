<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { timeAgo } from '$ui/shell/notification-view';
	import { useValidation } from './validation.svelte';

	/**
	 * The mark of an element changed by hand in the validated specification
	 * that no reading of the code can confirm (criterion 956cb2ac): a small
	 * icon whose tooltip names who changed it and when, until the next
	 * retrospecification is validated. An element the code implements has a
	 * line on Code drift instead, so it carries no mark.
	 */
	let { anchor }: { anchor: string } = $props();
	const validation = useValidation();
	const mark = $derived.by(() => {
		const edit = validation.doc.specEdits?.[anchor];
		return edit && !edit.implemented ? edit : null;
	});
	const tip = $derived(mark ? `Changed since the last Reverse-Specification · ${mark.by.name}, ${timeAgo(mark.at)}` : '');
</script>

{#if mark}
	<span class="grid size-9 place-items-center text-orange-ink" role="img" aria-label={tip} title={tip}><Icon name="history" size={15} /></span>
{/if}
