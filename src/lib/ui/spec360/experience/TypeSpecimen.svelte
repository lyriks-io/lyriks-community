<script lang="ts">
	import { typeSpecimen, type DesignSystem, type TypeSize } from '$application/spec360/experience';
	import { LIST } from '../page/look';

	/**
	 * The type scale as a specimen (ac-brand-design-system-read): from the
	 * largest size down, "Aa" written at the size in the brand's family, the
	 * size's name, its pixels, what it is for and its line height.
	 */
	let { ds }: { ds: DesignSystem } = $props();
	const px = (n: number) => `${Math.round(n * 100) / 100}px`;
	// "Aa" keeps to its column: a display size is drawn at the largest the row holds.
	const DRAWN_MAX = 56;
	const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);
	const note = (t: TypeSize) => [sentence(t.usage), t.lineHeight ? `Line height ${t.lineHeight}.` : ''].filter(Boolean).join(' ');
</script>

<div class={LIST}>
	{#each typeSpecimen(ds.sizes) as t (t.name)}
		<div class="flex flex-wrap items-baseline gap-x-[18px] gap-y-1 border-t border-evo-line-soft px-[18px] py-2 first:border-t-0" title={t.usage ? `${t.name}: ${t.usage}` : t.name}>
			<span
				aria-hidden="true"
				class="w-16 flex-none overflow-visible leading-[1.1] font-semibold whitespace-nowrap text-evo-ink"
				style:font-size="{Math.min(t.px ?? 14, DRAWN_MAX)}px"
				style:font-family={ds.familyCss || undefined}>Aa</span
			>
			<b class="w-[110px] flex-none [overflow-wrap:anywhere]">{t.name}</b>
			<span class="w-[52px] flex-none font-evo-mono text-[0.8125rem] font-bold text-evo-ink">{t.px !== null ? px(t.px) : t.value}</span>
			<span class="min-w-[200px] flex-1 text-sm text-evo-muted max-[560px]:min-w-0 max-[560px]:basis-full">
				{note(t)}
			</span>
		</div>
	{/each}
</div>
