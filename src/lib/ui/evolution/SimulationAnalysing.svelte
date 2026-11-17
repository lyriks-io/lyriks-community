<script lang="ts">
	import { Icon } from '$ui/design-system';

	/**
	 * What the Simulation shows while the platform reads the change on its own:
	 * the design's orbit and title, and what is being done in words. The design's
	 * bar and "n / 10 compared" count are left out: the reading reports no
	 * progress, and a number made up on a timer is not one.
	 */
	interface Props {
		requestKey: string | null;
	}
	let { requestKey }: Props = $props();
</script>

<div
	class="animate-lk-fade flex flex-col items-center gap-[18px] rounded-2xl border border-transparent bg-surface px-6 pt-11 pb-10 text-center"
	role="status"
>
	<span class="relative size-14 flex-none" aria-hidden="true">
		<span class="animate-lk-spin absolute inset-0 rounded-full bg-orange [animation-duration:1.1s] [mask-image:conic-gradient(black_70%,transparent_70%)]"></span>
		<span class="absolute inset-1 rounded-full bg-surface"></span>
		<span class="animate-lk-pulse absolute inset-[9px] grid place-items-center bg-violet-ink text-paper [animation-duration:1.6s]">
			<Icon name="sparkles" size={18} />
		</span>
	</span>
	<h2 class="text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-evo-ink">Lyriks is simulating evolution {requestKey ?? ''}</h2>
	<span class="text-ink-2">Laying the change over the product: what it moves, how far, and whether it fits.</span>
</div>
