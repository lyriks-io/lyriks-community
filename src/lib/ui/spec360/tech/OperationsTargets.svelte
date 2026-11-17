<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { AUDIT_LOG_LEVELS, PERFORMANCE_UNITS, type AuditLogLevel, type PerformanceUnit } from '$domain/foundation';
	import type { FactItem } from '$application/spec360/tech';
	import {
		AUDIT_LOG_MEANING,
		OPERATIONS_TARGETS,
		OPERATIONS_TARGET_TITLE,
		operationsTargetRefusal,
		type OperationsTargetEdit,
		type OperationsTargetKey,
		type OperationsTargets
	} from '$application/spec360/operations-targets';
	import { Icon, pushToast } from '$ui/design-system';
	import { ICON_BTN } from '$ui/evolution/evo-look';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import { CHIP, CHIP_ON, FIELD, LIST, PRESS_FILL, QUIET } from '$ui/spec360/page/look';

	/**
	 * The three targets of Operations on Health, always listed, one not set yet
	 * reading Not set (criterion 8a696e52). Whoever may edit the project sets
	 * each in place, on a draft or a validated specification alike (criterion
	 * 970aca7c): Audit logs by picking its level, the other two through a small
	 * form in place of the row. Each row keeps its discussion and its validation.
	 */
	interface Props {
		/** The targets the spec holds, as Health reads them. */
		items: readonly FactItem[];
		/** What the forms open on. */
		targets: OperationsTargets;
		editable: boolean;
	}
	let { items, targets, editable }: Props = $props();
	const edits = useEdits();
	const validation = useValidation();
	const itemOf = (key: OperationsTargetKey) => items.find((i) => i.key === key) ?? null;
	// A sentence written as a chip would be squeezed: long values read as text, as on the other facts.
	const LONG = 48;

	type Row = { action: string; target: string; unit: PerformanceUnit };
	type PerfDraft = { actions: Row[]; latencyP95Ms: string; latencyP99Ms: string; ttiMs: string; bundleSizeKb: string; perfNotes: string };
	type AvailDraft = { availabilityPct: string; errorBudgetPct: string; notes: string };
	const PERF_FIELDS = [
		{ key: 'latencyP95Ms', label: 'p95 latency', unit: 'ms' },
		{ key: 'latencyP99Ms', label: 'p99 latency', unit: 'ms' },
		{ key: 'ttiMs', label: 'Time to interactive', unit: 'ms' },
		{ key: 'bundleSizeKb', label: 'Bundle size', unit: 'kB' }
	] as const;
	const AVAIL_FIELDS = [
		{ key: 'availabilityPct', label: 'Time up', unit: '%' },
		{ key: 'errorBudgetPct', label: 'Error budget', unit: '%' }
	] as const;
	const blankRow = (): Row => ({ action: '', target: '', unit: 'ms' });

	let open = $state<'performance' | 'availability' | null>(null);
	let perf = $state<PerfDraft>({ actions: [], latencyP95Ms: '', latencyP99Ms: '', ttiMs: '', bundleSizeKb: '', perfNotes: '' });
	let avail = $state<AvailDraft>({ availabilityPct: '', errorBudgetPct: '', notes: '' });
	let saving = $state(false);
	// The level clicked reads at once, until the page reads it back (or it is refused and the one before reads again).
	let picked = $state<AuditLogLevel | null>(null);
	const level = $derived(picked ?? targets.auditLogs);

	function edit(key: 'performance' | 'availability') {
		const p = targets.performance;
		perf = { ...p, actions: p.actions.length ? p.actions.map((r) => ({ ...r })) : [blankRow()] };
		avail = { ...targets.availability };
		open = key;
	}

	async function save() {
		if (!open || saving) return;
		const change: OperationsTargetEdit = open === 'performance' ? { target: 'performance', values: $state.snapshot(perf) } : { target: 'availability', values: $state.snapshot(avail) };
		const refusal = operationsTargetRefusal(change);
		if (refusal) return void pushToast({ level: 'error', message: `The targets were not saved. ${refusal}` });
		saving = true;
		const ok = await edits.setOperationsTarget(change);
		saving = false;
		if (ok) open = null;
	}

	async function pick(next: AuditLogLevel) {
		if (next === level) return;
		picked = next;
		await edits.setOperationsTarget({ target: 'audit-logs', level: next });
		picked = null;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = null;
	}

	// The design's field (.ly-input) under its label, as the other forms in place of the Specification 360°.
	const field = `box-border ${FIELD} px-3 py-2 font-evo text-[0.9375rem] leading-normal`;
	const LABEL = 'font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase';
</script>

<div id="kb-facts-health" class={LIST}>
	{#each OPERATIONS_TARGETS as key (key)}
		{@const item = itemOf(key)}
		{@const anchor = anchorOf('health', key)}
		{@const title = OPERATIONS_TARGET_TITLE[key]}
		<div id={anchorDomId(anchor)} data-evo-waits={(item && validation.waitsOnMe(anchor)) || undefined} class="flex scroll-mt-36 flex-col gap-2 border-t border-evo-line-soft px-[18px] py-4 first:border-t-0">
			<div class="flex flex-wrap items-start gap-3">
				<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
					<h3 class="m-0 text-[1.0625rem] leading-[1.35] font-bold tracking-[-0.01em] text-evo-ink">{title}</h3>
					{#if key === 'audit-logs'}
						<p class="m-0 text-[0.9375rem] leading-[1.55] {level ? 'text-evo-ink-2' : 'text-evo-muted'}">{level ? AUDIT_LOG_MEANING[level] : 'Not set'}</p>
						{#if editable}
							<span role="radiogroup" aria-label="Audit log level" class="mt-1 flex flex-wrap gap-1.5">
								{#each AUDIT_LOG_LEVELS as l (l.code)}
									<button
										type="button"
										role="radio"
										aria-checked={level === l.code}
										class="pressable {level === l.code ? CHIP_ON : CHIP} px-2.5 py-0.5"
										title={AUDIT_LOG_MEANING[l.code]}
										onclick={() => void pick(l.code)}>{l.label}</button
									>
								{/each}
							</span>
						{:else if item}
							<span class="mt-1 flex flex-wrap gap-1.5">{#each item.chips as chip, c (c)}<span class="{CHIP} px-2.5 py-0.5">{chip}</span>{/each}</span>
						{/if}
					{:else if open === key}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<form
							class="animate-lk-in-fast mt-1 flex w-full flex-col gap-3 rounded-xl border-2 border-ink bg-paper p-3"
							aria-label="Set the {title.toLowerCase()}"
							onkeydown={onKey}
							onsubmit={(e) => {
								e.preventDefault();
								void save();
							}}
						>
							{#if key === 'performance'}
								<span class={LABEL}>Response time of each key action</span>
								{#each perf.actions as row, i (i)}
									<span class="flex flex-wrap items-center gap-2">
										<input class="{field} min-w-0 flex-[2_1_220px]" placeholder="Action, e.g. Search a room" aria-label="Action {i + 1}" bind:value={row.action} />
										<input class="{field} w-24" inputmode="decimal" placeholder="300" aria-label="Target of action {i + 1}" bind:value={row.target} />
										<select class="{field} w-24" aria-label="Unit of action {i + 1}" bind:value={row.unit}>
											{#each PERFORMANCE_UNITS as u (u.code)}<option value={u.code}>{u.label}</option>{/each}
										</select>
										<button type="button" class="grid size-9 place-items-center rounded-lg {ICON_BTN} text-ink" aria-label="Remove action {i + 1}" title="Remove this action" onclick={() => perf.actions.splice(i, 1)}>
											<Icon name="x" size={14} />
										</button>
									</span>
								{/each}
								<button type="button" class="{QUIET} self-start text-[0.8125rem] font-semibold" onclick={() => perf.actions.push(blankRow())}>+ Add an action</button>
								<span class="grid grid-cols-2 gap-2 max-[700px]:grid-cols-1">
									{#each PERF_FIELDS as f (f.key)}
										<label class="flex flex-col gap-1 {LABEL}">
											{f.label} ({f.unit})
											<input class="{field} w-full normal-case" inputmode="decimal" bind:value={perf[f.key]} />
										</label>
									{/each}
								</span>
								<label class="flex flex-col gap-1 {LABEL}">
									Notes
									<textarea rows="2" class="{field} w-full normal-case" placeholder="Where and how the targets are measured" bind:value={perf.perfNotes}></textarea>
								</label>
							{:else}
								<span class="grid grid-cols-2 gap-2 max-[700px]:grid-cols-1">
									{#each AVAIL_FIELDS as f (f.key)}
										<label class="flex flex-col gap-1 {LABEL}">
											{f.label} ({f.unit})
											<input class="{field} w-full normal-case" inputmode="decimal" bind:value={avail[f.key]} />
										</label>
									{/each}
								</span>
								<label class="flex flex-col gap-1 {LABEL}">
									Notes
									<textarea rows="2" class="{field} w-full normal-case" placeholder="Business hours only, maintenance windows…" bind:value={avail.notes}></textarea>
								</label>
							{/if}
							<span class="flex justify-end gap-2">
								<button type="button" class={QUIET} onclick={() => (open = null)}>Cancel</button>
								<button type="submit" class="{PRESS_FILL} min-h-9 px-4 text-xs" disabled={saving}>Save</button>
							</span>
						</form>
					{:else if item}
						{#if item.description}<p class="m-0 text-[0.9375rem] leading-[1.55] text-evo-ink-2">{item.description}</p>{/if}
						{#if item.chips.length}
							<span class="mt-1 flex flex-wrap gap-1.5">
								{#each item.chips as chip, c (c)}
									{#if chip.length > LONG}
										<span class="block w-full text-sm leading-[1.5] text-evo-ink-3">{chip}</span>
									{:else}
										<span class="{CHIP} px-2.5 py-0.5">{chip}</span>
									{/if}
								{/each}
							</span>
						{/if}
					{:else}
						<p class="m-0 text-[0.9375rem] text-evo-muted">Not set</p>
					{/if}
				</div>
				<span class="flex flex-none items-start gap-1.5">
					{#if editable && key !== 'audit-logs' && open !== key}
						<button type="button" class="grid size-9 place-items-center rounded-lg {ICON_BTN} text-ink" aria-label="Set the {title.toLowerCase()}" title="Set the {title.toLowerCase()}" onclick={() => edit(key)}>
							<Icon name="pencil" size={16} />
						</button>
					{/if}
					{#if item}<SpecControls {anchor} title={item.title} />{/if}
				</span>
			</div>
			<BlockFoot {anchor} {title} />
		</div>
	{/each}
</div>
