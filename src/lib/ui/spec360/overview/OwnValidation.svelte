<script lang="ts">
	import SpecControls from '../SpecControls.svelte';

	/**
	 * A profile of Who uses it reviewed on its own with the standard control of
	 * every element of Knowledge, the feature page's (criterion e20318e7): the
	 * reviewer picker, the cross, the check and the initials of its people.
	 */
	let { anchor, title }: { anchor: string; title: string } = $props();
</script>

<SpecControls {anchor} {title} discussed={false} inline />
