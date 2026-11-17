<script lang="ts">
	/**
	 * The dashed button that closes a list of elements the Edit mode can create (criterion 51e215ef of
	 * feat-lyriks-copy-a52881-47): one look for every list, Add a <kind>.
	 */
	let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button
	type="button"
	class="mt-2 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-ink-3 bg-transparent text-sm font-semibold text-blue-ink transition-colors duration-150 hover:border-ink hover:bg-toner-1"
	{onclick}><span aria-hidden="true">+</span>{label}</button
>
