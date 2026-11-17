<script lang="ts">
	import { PillTabs, type PillTab } from '$ui/design-system';
	import type { ExperienceTab } from '$domain/experience';

	interface Props {
		/** Active experience tab (only meaningful when brand mode is off). */
		active: ExperienceTab;
		/** Whether the Design tab is the active one. */
		brandActive: boolean;
		onSwitch: (tab: ExperienceTab | 'brand') => void;
	}
	let { active, brandActive, onSwitch }: Props = $props();

	// One bar for the whole Experience page: the design.md first, then the
	// journeys and the screens they visit. The experience is described, not drawn:
	// no canvas, no components library, no demo data, no simulator on screen
	// (AI clients still run the prototype through the MCP).
	const tabs: PillTab[] = [
		{ id: 'brand', label: 'Design', desc: 'The design.md and its sources' },
		{ id: 'journeys', label: 'Journeys', desc: 'Step-by-step parcours & test fixtures' },
		{ id: 'screens', label: 'Screens', desc: 'Every screen, its route and its visits' }
	];
</script>

<PillTabs
	{tabs}
	active={brandActive ? 'brand' : active}
	onSelect={(id) => onSwitch(id as ExperienceTab | 'brand')}
	label="Experience views"
/>
