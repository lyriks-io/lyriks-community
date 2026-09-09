<script lang="ts">
	import type { IconName } from '$ui/design-system';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import type { OperationsSection } from '$domain/foundation';
	import type { OperationsStore } from '../operations-store.svelte';
	import I18nSection from './I18nSection.svelte';
	import QualitySection from './QualitySection.svelte';
	import MigrationSection from './MigrationSection.svelte';
	import FixturesSection from './FixturesSection.svelte';

	interface Props {
		store: OperationsStore;
		/** Supported languages, owned by the Business slice, edited in the i18n section. */
		languages: string[];
		onLanguagesChange: (values: string[]) => void;
	}
	let { store, languages, onLanguagesChange }: Props = $props();

	interface Item {
		id: OperationsSection;
		label: string;
		icon: IconName;
		hint: string;
	}
	// Migration only shows when the project replaces an existing system (the
	// store's flag follows Step 01's source mode) — greenfield has nothing to
	// roll over.
	const items = $derived<{ label: string; items: Item[] }[]>([
		{
			label: 'Product foundation',
			items: [
				{ id: 'i18n', label: 'i18n & locales', icon: 'globe', hint: 'Languages, formats, timezone' },
				{ id: 'quality', label: 'Quality budgets', icon: 'gauge', hint: 'SLO, perf, a11y, browsers' }
				// UI states hidden for now — belongs to the Experience screens, not the Ops tab.
			]
		},
		{
			label: 'Roll-out & data',
			items: [
				...(store.migrationExpected
					? [{ id: 'migration', label: 'Migration', icon: 'layers', hint: 'Roll-out, backfill, rollback' } satisfies Item]
					: []),
				{ id: 'fixtures', label: 'Test fixtures', icon: 'database', hint: 'Realistic sample data' }
			]
		}
	]);

	// Filled-count badge per section, so the sidebar shows progress at a glance.
	const filled = (v: string) => v.trim().length > 0;
	const counts = $derived.by<Record<OperationsSection, number>>(() => {
		const d = store.draft;
		return {
			i18n: Object.values(d.i18n).filter((v) => typeof v === 'string' && filled(v)).length + d.i18n.locales.length,
			quality: Object.values(d.quality).filter(filled).length,
			uiStates: store.screens.filter((s) => store.screenStateCount(s) > 0).length,
			migration:
				[d.migration.strategy, d.migration.backwardCompatWindow, d.migration.dataBackfill, d.migration.rollbackPlan, d.migration.notes].filter(
					(v) => filled(v)
				).length + d.migration.flagsExpected.length,
			fixtures: d.testFixtures.length
		};
	});

	const navGroups = $derived<SectionNavGroup[]>(
		items.map((group) => ({
			label: group.label,
			items: group.items.map((item) => ({ ...item, count: counts[item.id] }))
		}))
	);

	// Fall back to i18n when the stored section is hidden (Migration on a
	// greenfield project, or UI states which is no longer surfaced here).
	const active = $derived.by(() => {
		const s = store.activeSection;
		if (s === 'uiStates') return 'i18n';
		if (s === 'migration' && !store.migrationExpected) return 'i18n';
		return s;
	});
</script>

<SectionNav
	groups={navGroups}
	{active}
	onSelect={(id) => store.setActiveSection(id as OperationsSection)}
>
	{#if active === 'i18n'}
		<I18nSection {store} {languages} {onLanguagesChange} />
	{:else if active === 'quality'}
		<QualitySection {store} />
	{:else if active === 'migration'}
		<MigrationSection {store} />
	{:else}
		<FixturesSection {store} />
	{/if}
</SectionNav>
