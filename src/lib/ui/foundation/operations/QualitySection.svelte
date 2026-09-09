<script lang="ts">
	import { Field, SectionCard, TextInput, Textarea } from '$ui/design-system';
	import type { OperationsStore } from '../operations-store.svelte';

	interface Props {
		store: OperationsStore;
	}
	let { store }: Props = $props();
	const q = $derived(store.draft.quality);
</script>

<SectionCard
	eyebrow="Quality budgets"
	icon="gauge"
	title="SLOs, perf budgets, a11y, browsers"
	subtitle="Non-functional targets that become guardrails in the AI Generation Contract."
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Field label="Latency p95 (ms)" hint="95th-percentile response time target.">
			<TextInput value={q.latencyP95Ms} placeholder="350" oninput={(v) => store.setQualityField('latencyP95Ms', v)} />
		</Field>
		<Field label="Latency p99 (ms)">
			<TextInput value={q.latencyP99Ms} placeholder="900" oninput={(v) => store.setQualityField('latencyP99Ms', v)} />
		</Field>
		<Field label="Error budget (%)" hint="Acceptable error rate over a rolling 30-day window.">
			<TextInput value={q.errorBudgetPct} placeholder="0.5" oninput={(v) => store.setQualityField('errorBudgetPct', v)} />
		</Field>
		<Field label="Availability target (%)">
			<TextInput value={q.availabilityPct} placeholder="99.9" oninput={(v) => store.setQualityField('availabilityPct', v)} />
		</Field>
		<Field label="Bundle size budget (KB)" hint="gzipped, per route.">
			<TextInput value={q.bundleSizeKb} placeholder="250" oninput={(v) => store.setQualityField('bundleSizeKb', v)} />
		</Field>
		<Field label="Time to interactive (ms)">
			<TextInput value={q.ttiMs} placeholder="2000" oninput={(v) => store.setQualityField('ttiMs', v)} />
		</Field>
		<Field label="Accessibility level">
			<TextInput value={q.a11yLevel} placeholder="WCAG 2.2 AA" oninput={(v) => store.setQualityField('a11yLevel', v)} />
		</Field>
		<Field label="Browser / device matrix">
			<TextInput value={q.browsers} placeholder="Last 2 Chrome/Safari/Firefox, iOS 16+" oninput={(v) => store.setQualityField('browsers', v)} />
		</Field>
	</div>

	<Field label="Perf notes" hint="Caching strategy, lazy-loading rules, perf trade-offs.">
		<Textarea
			value={q.perfNotes}
			rows={2}
			placeholder="Aggressively cache /api/me 60s. Pre-fetch invoice list on dashboard hover…"
			oninput={(v) => store.setQualityField('perfNotes', v)}
		/>
	</Field>
</SectionCard>
