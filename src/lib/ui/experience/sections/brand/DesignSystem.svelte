<script lang="ts">
	/**
	 * One design conversation, two altitudes: the traits state the intent, the
	 * tokens are what the Experience simulator literally renders with. They used
	 * to be two rail entries asking for the same corner style and density twice.
	 */
	import { Card } from '$ui/design-system';
	import type { ExperienceStore } from '../../draft-store.svelte';
	import BrandSectionHeader from './BrandSectionHeader.svelte';
	import Markers from './Markers.svelte';
	import DesignSystemPanel from '../DesignSystemPanel.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();
</script>

<Card class="space-y-5">
	<BrandSectionHeader
		kicker="Design system"
		title="The traits and tokens every screen renders with"
		help="Traits are the high-level decisions; they translate into concrete CSS (radius, padding, shadow, transitions, casing…) and apply across every component. Tokens are what the Experience simulator draws with; corner style and spacing are set by the traits above."
	/>

	<div class="space-y-2">
		<p class="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Traits</p>
		<Markers {store} />
	</div>

	<div class="space-y-2 border-t border-line pt-4">
		<p class="text-[10px] font-semibold uppercase tracking-widest text-ink-400">
			Tokens <span class="font-normal normal-case tracking-normal text-ink-300">· simulator rendering</span>
		</p>
		<div class="rounded-card border border-line">
			<DesignSystemPanel {store} />
		</div>
	</div>
</Card>
