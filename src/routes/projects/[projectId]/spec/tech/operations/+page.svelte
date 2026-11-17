<script lang="ts">
	import Gauge from '$ui/design-system/Gauge.svelte';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import SectionHead from '$ui/spec360/page/SectionHead.svelte';
	import Ring from '$ui/spec360/page/Ring.svelte';
	import { CARD, CHIP, LEAD } from '$ui/spec360/page/look';
	import DeviceOutline from '$ui/spec360/tech/DeviceOutline.svelte';
	import OperationsTargets from '$ui/spec360/tech/OperationsTargets.svelte';
	import ViewEmpty from '$ui/spec360/tech/ViewEmpty.svelte';
	import type { PageData } from './$types';

	/**
	 * Technology & data · Operations (criterion 8a696e52), in the order its lead
	 * says: where the product runs, its devices and its machines drawn; the
	 * targets it must hold once it runs, what they are for, each set in place by
	 * whoever may edit (criterion 970aca7c) or asked of the reader's AI with
	 * Ask my AI, the one way the page asks it; then how much of the spec the
	 * code holds, drawn as a share and a ring. Each is discussed and validated
	 * where the spec lists it.
	 */
	let { data }: { data: PageData } = $props();
	const validation = useValidation();
	const impl = $derived(data.implementation);
	const env = $derived(data.environments);
	// Implementation and Environments are drawn above; the other facts keep their rows.
	const DRAWN = new Set(['implementation', 'environments']);
	const has = (key: string) => data.items.some((i) => i.key === key);
	const rest = $derived(data.items.filter((i) => !DRAWN.has(i.key)));
	const waits = (anchor: string) => validation.waitsOnMe(anchor) || undefined;
	const IMPLEMENTATION = anchorOf('health', 'implementation');
	const ENVIRONMENTS = anchorOf('health', 'environments');
	const editable = $derived(validation.source.canWrite);
	const describePrompt = $derived(
		`With the Lyriks MCP, on project ${data.projectId}, describe where the product runs: the devices it is used on and the machines it runs on, in the sections that hold them (describe_section says how), from the code or from what I tell you. Ask me what you cannot tell.`
	);
	const OPERATIONS_INTRO =
		'What the product must guarantee once it runs: how fast it answers, how much of the time it is up, which actions leave a trace in an audit log. Whoever builds it designs and tests for these targets.';
</script>

<section aria-label="Operations" class="flex animate-lk-in flex-col">
	<p class={LEAD}>Where the product runs, the targets it must hold once it runs, and how much of the specification the code holds.</p>


	<div id={anchorDomId(ENVIRONMENTS)} data-evo-waits={waits(ENVIRONMENTS)} class="flex scroll-mt-36 flex-col gap-3">
		<SectionHead title="Environments">
			{#snippet actions()}{#if has('environments')}<SpecControls anchor={ENVIRONMENTS} title="Environments" />{/if}{/snippet}
		</SectionHead>
		<div class="{CARD} -mt-1 flex flex-col gap-3.5">
			{#if env.devices.length || env.machines.length}
				<!-- From the top: every drawing in its box of the same height, every name on the same line, a machine's second line under it. -->
				<div class="flex flex-wrap items-start gap-x-[18px] gap-y-3">
					<!-- The devices drawn first, then the form factors with no device, then the machines. -->
					{#each env.devices.filter((d) => d.shape) as d (d.code)}<DeviceOutline shape={d.shape!} label={d.label} />{/each}
					{#each env.devices.filter((d) => !d.shape) as d (d.code)}
						<span class="self-center {CHIP} px-2.5 py-0.5">{d.label}</span>
					{/each}
					{#each env.machines as m (m.id)}
						<DeviceOutline shape="server" label={m.name} detail={[m.kind, m.place].filter(Boolean).join(' · ')} />
					{:else}
						<span class="self-center text-[0.8125rem] font-semibold text-evo-red">✕ No server described</span>
					{/each}
				</div>
				{#each env.machines.filter((m) => m.description) as m (m.id)}
					<p class="m-0 text-[0.9375rem] leading-[1.55] text-evo-ink-2">
						{#if env.machines.length > 1}<b class="font-semibold">{m.name}.</b>{/if}
						{m.description}
					</p>
				{/each}
			{:else}
				<!-- Nothing yet: what fills it, and the step that starts it (criterion 0b935dad). -->
				<ViewEmpty headline="No device or machine yet." text="Your AI describes where the product runs, from the code or from what you tell it, and you review it here." prompt={editable ? describePrompt : null} />
			{/if}
		</div>
		<BlockFoot anchor={ENVIRONMENTS} title="Environments" />
	</div>

	<div class="group/section">
		<SectionHead title="Operations" intro={editable ? `${OPERATIONS_INTRO} Set each one here, or ask your AI with Ask my AI, at the foot of the navigation.` : OPERATIONS_INTRO}>
			{#snippet actions()}
				{#if rest.length}<SectionValidateAll anchors={rest.map((i) => anchorOf('health', i.key))} what="health facts" sectionId="kb-facts-health" />{/if}
			{/snippet}
		</SectionHead>
		<OperationsTargets items={rest} targets={data.targets} {editable} />
	</div>

	<div id={anchorDomId(IMPLEMENTATION)} data-evo-waits={waits(IMPLEMENTATION)} class="flex scroll-mt-36 flex-col gap-3">
		<SectionHead title="Implementation">
			{#snippet actions()}{#if has('implementation')}<SpecControls anchor={IMPLEMENTATION} title="Implementation" />{/if}{/snippet}
		</SectionHead>
		{#if impl}
			<div class="-mt-1 grid grid-cols-2 gap-3 max-[700px]:grid-cols-1">
				<div class={CARD}>
					<div class="text-[1.75rem] leading-[1.1] font-bold tracking-[-0.03em] tabular-nums">{impl.share}</div>
					<div class="mt-1 text-sm text-evo-muted">{impl.found} of {impl.expected} spec elements are located in the code.</div>
					<Gauge parts={[{ value: impl.found, tone: 'bg-evo-green-stroke' }]} total={impl.expected} counts height={10} track="bg-evo-track" class="mt-2.5" label="{impl.share} of the spec elements located in the code" />
				</div>
				<div class="{CARD} flex items-center gap-4">
					<Ring value={impl.complete} max={impl.measured} size={72} label={null} ariaLabel="{impl.complete} of {impl.measured} features fully implemented" />
					<div>
						<div class="text-[1.75rem] leading-[1.1] font-bold tracking-[-0.03em] tabular-nums">{impl.complete} / {impl.measured}</div>
						<div class="mt-1 text-sm text-evo-muted">
							features fully implemented{impl.none ? `, ${impl.none} with no code found yet` : ''}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<p class="{CARD} m-0 -mt-1 text-[0.9375rem] text-evo-muted">No code is linked to this specification yet. Once Lyriks reads the code, this part shows how much of the specification it finds there.</p>
		{/if}
		<BlockFoot anchor={IMPLEMENTATION} title="Implementation" />
	</div>
</section>
