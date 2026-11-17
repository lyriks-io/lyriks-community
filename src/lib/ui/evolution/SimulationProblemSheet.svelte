<script lang="ts">
	import { COHERENCE_AXES, DOCKING_QUALIFICATIONS, FINDING_SEVERITIES, IMPACT_SECTIONS, type CoherenceAxis, type FindingSeverity } from '$domain/evolution';
	import { portalWhile } from '$ui/design-system';
	import type { SimulationItem } from './SimulationImpactCard.svelte';
	import { personName } from './people';

	/**
	 * One impact read in full, the design's problem sheet over the page: in short,
	 * where it stands in the product, why it weighs what it weighs, the decision
	 * taken and the finding behind it. Every line is read from the docking and the
	 * coherence finding; the backdrop, the cross and the foot close it.
	 */
	interface Props {
		item: SimulationItem;
		finding: { readonly severity: FindingSeverity; readonly axis: CoherenceAxis } | null;
		members: readonly { id: string; name: string }[];
		onClose: () => void;
	}
	let { item, finding, members, onClose }: Props = $props();

	const grade = $derived(item.grade === 'major' ? 'MAJOR IMPACT' : item.grade === 'minor' ? 'MINOR IMPACT' : 'COMPATIBLE ITEM');
	const why = $derived(
		finding
			? (FINDING_SEVERITIES.find((s) => s.code === finding.severity)?.hint ?? '')
			: (DOCKING_QUALIFICATIONS.find((q) => q.code === item.qualification)?.hint ?? '')
	);
	const sections = $derived.by(() => {
		const part = IMPACT_SECTIONS.find((s) => s.code === item.section)?.label ?? 'Elsewhere';
		const risk = item.point?.risk ?? null;
		return [
			{ h: 'IN SHORT', text: item.reason, list: [] },
			{ h: 'WHERE IT STANDS IN THE PRODUCT', text: '', list: [{ k: 'Part', v: part }, ...(item.note ? [{ k: 'Why it moves', v: item.note }] : [])] },
			{ h: item.grade === 'major' ? 'WHY IT IS MAJOR' : 'WHY IT IS MINOR', text: why, list: [] },
			...(risk ? [{ h: 'DECISION', text: `Accepted as a risk by ${personName(risk.by, members)}: ${risk.reason}`, list: [] }] : []),
			...(finding
				? [
						{
							h: 'REFERENCES',
							text: '',
							list: [
								{
									k: 'Finding',
									v: `${FINDING_SEVERITIES.find((s) => s.code === finding.severity)?.label ?? finding.severity} · ${COHERENCE_AXES.find((a) => a.code === finding.axis)?.label ?? finding.axis}`
								}
							]
						}
					]
				: [])
		].filter((s) => s.text || s.list.length > 0);
	});
</script>

<!-- Under <body>: the tab rises in on a transform, which would hold a fixed sheet inside it. -->
<div class="animate-lk-fade fixed inset-0 z-[55] flex justify-end bg-evo-ink/45" use:portalWhile={true}>
	<button type="button" class="min-w-0 flex-auto cursor-pointer" aria-label="Close record" onclick={onClose}></button>
	<div role="dialog" aria-label={item.label} class="animate-lk-up box-border flex h-full w-[640px] max-w-full flex-col gap-5 overflow-y-auto border-l-2 border-ink bg-paper p-7 font-evo text-evo-ink shadow-pop">
		<div class="flex items-start justify-between gap-3">
			<div class="flex flex-col gap-1.5">
				<span class="font-evo-mono text-xs tracking-[0.08em] text-red-ink">PROBLEM SHEET · {item.code} · {grade}</span>
				<h2 class="text-[1.375rem] leading-tight font-bold tracking-[-0.02em]">{item.label}</h2>
			</div>
			<button type="button" class="size-11 flex-none rounded-evo-btn border-[1.5px] border-line bg-transparent text-xl text-ink hover:border-ink" aria-label="Close" onclick={onClose}>×</button>
		</div>
		{#each sections as section (section.h)}
			<div class="flex flex-col gap-2">
				<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3">{section.h}</span>
				{#if section.text}<p class="leading-[1.6] text-ink-2">{section.text}</p>{/if}
				{#if section.list.length > 0}
					<div class="flex flex-col gap-1.5">
						{#each section.list as line (line.k)}
							<div class="flex flex-wrap items-baseline gap-2.5 rounded-lg bg-toner-1 px-3 py-2">
								<span class="flex-none font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">{line.k}</span>
								<span class="text-sm font-bold">{line.v}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
		<button type="button" class="pressable min-h-11 self-start rounded-lg border-[1.5px] border-ink bg-transparent px-4 text-xs font-bold tracking-[0.07em] text-ink uppercase" onclick={onClose}>Back to the analysis</button>
	</div>
</div>
