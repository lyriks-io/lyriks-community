<script lang="ts">
	import { CHIP, CHIP_ON } from './look';

	/** The black-on-current chips under a page title that switch its views (Tech and data's Data map, Architecture…). */
	interface Props {
		label: string;
		items: readonly { href: string; label: string; current: boolean }[];
	}
	let { label, items }: Props = $props();
</script>

<nav aria-label={label} class="mt-[18px] flex flex-wrap gap-1.5">
	{#each items as it (it.href)}
		<a
			href={it.href}
			aria-current={it.current ? 'page' : undefined}
			class="inline-flex min-h-9 items-center px-3.5 no-underline transition-colors duration-150 {it.current
				? `${CHIP_ON} hover:text-paper`
				: `${CHIP} hover:border-ink hover:text-ink`}">{it.label}</a
		>
	{/each}
</nav>
