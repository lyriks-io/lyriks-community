<script lang="ts" module>
	export type TraceabilityTab = 'overview' | 'baselines' | 'approvals';
</script>

<script lang="ts">
	import { PillTabs, type PillTab } from '$ui/design-system';

	interface Props {
		active: TraceabilityTab;
		onSwitch: (tab: TraceabilityTab) => void;
	}
	let { active, onSwitch }: Props = $props();

	const tabs: PillTab[] = [
		{ id: 'overview', label: 'Coverage', desc: 'Requirements & gaps' },
		{ id: 'baselines', label: 'Baselines', desc: 'Named versions & snapshots' },
		{ id: 'approvals', label: 'Approvals', desc: 'Sign-off & accepted risks' }
	];
</script>

<PillTabs
	{tabs}
	{active}
	onSelect={(id) => onSwitch(id as TraceabilityTab)}
	label="Traceability views"
/>
