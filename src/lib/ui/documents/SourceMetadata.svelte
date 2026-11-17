<script lang="ts">
	import type { DocumentSource } from '$domain/documents';
	let { source, update }: { source: DocumentSource; update: (patch: Partial<DocumentSource>) => void } = $props();
	type Evidence = NonNullable<DocumentSource['evidence']>;
	type Decision = NonNullable<DocumentSource['decision']>['status'];

	// Stored codes stay as they are; only what the author reads is in words.
	const KINDS: { code: Evidence['kind']; label: string }[] = [
		{ code: 'unit', label: 'Unit' },
		{ code: 'integration', label: 'Integration' },
		{ code: 'e2e', label: 'End-to-end' },
		{ code: 'visual', label: 'Visual' },
		{ code: 'load', label: 'Load' },
		{ code: 'manual', label: 'Manual' },
		{ code: 'prototype', label: 'Prototype' }
	];
	const RESULTS: { code: Evidence['result']; label: string }[] = [
		{ code: 'not_run', label: 'Not run yet' },
		{ code: 'passed', label: 'Passed' },
		{ code: 'failed', label: 'Failed' },
		{ code: 'blocked', label: 'Blocked' }
	];
	const DECISIONS: { code: Decision; label: string }[] = [
		{ code: 'proposed', label: 'Proposed' },
		{ code: 'accepted', label: 'Accepted' },
		{ code: 'superseded', label: 'Replaced by another choice' }
	];
	const FIELDS = [
		{ key: 'buildId', label: 'Version tested', hint: 'A commit hash, a build number or a release tag.' },
		{ key: 'artifact', label: 'Where the report is', hint: 'A link or path to the test report, a recording or a screenshot.' },
		{ key: 'command', label: 'How to run it again', hint: 'The command or the steps that reproduce the test.' },
		{ key: 'observedAt', label: 'When it ran', hint: 'A date, e.g. 2026-10-15.' },
		{ key: 'provenance', label: 'Who reported it', hint: 'The person, the CI job or the tool the result comes from.' }
	] as const;

	const labelOf = <T extends string>(list: { code: T; label: string }[], code: T | undefined) =>
		list.find((o) => o.code === code)?.label ?? code;

	function evidence(patch: Partial<Evidence>) {
		update({ evidence: { kind: 'manual', result: 'not_run', buildId: '', artifact: '', command: '',
			observedAt: '', provenance: '', criterionIds: [], ...source.evidence, ...patch } });
	}
	const inputClass =
		'w-full rounded-field border border-line bg-surface px-3 py-2 text-sm font-normal text-ink-800 outline-none focus:border-brand-300';
	const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-ink-700';
	const hintClass = 'text-xs font-normal text-ink-500';
	// What the closed section already holds, in words, so it need not be opened to know.
	const summary = $derived(
		[
			source.decision ? `Decision: ${labelOf(DECISIONS, source.decision.status)}` : null,
			source.evidence
				? `${labelOf(KINDS, source.evidence.kind)} test: ${labelOf(RESULTS, source.evidence.result)}`
				: null
		].filter(Boolean).join(' · ')
	);
</script>

<details class="rounded-field border border-line bg-surface-sunken/40 px-3 py-2.5">
	<summary class="cursor-pointer text-xs font-semibold text-ink-700">
		Technical decision or test result <span class="font-normal text-ink-500">(optional)</span>
		{#if summary}<span class="ml-1 font-normal text-brand-600">· {summary}</span>{/if}
	</summary>
	<p class="mt-1.5 text-xs text-ink-500">
		Only for two kinds of source: a technology choice the team made, or the result of a test run
		that backs an acceptance criterion. Any other source leaves this closed.
	</p>
	<div class="mt-3 space-y-4">
		<label class={labelClass}>
			Is this a technology choice?
			<select aria-label="Technology choice" class="{inputClass} sm:max-w-xs" value={source.decision?.status ?? ''}
				onchange={(e) => update({ decision: e.currentTarget.value
					? { status: e.currentTarget.value as Decision } : undefined })}>
				<option value="">No, not a technical decision</option>
				{#each DECISIONS as d (d.code)}<option value={d.code}>{d.label}</option>{/each}
			</select>
			<span class={hintClass}>
				When it is, write in the content what was chosen (technology, version), the alternatives
				and why.
			</span>
		</label>

		<div class="space-y-3">
			<label class="flex items-start gap-2 text-xs font-semibold text-ink-700">
				<input type="checkbox" class="mt-0.5" checked={!!source.evidence}
					onchange={(e) => e.currentTarget.checked ? evidence({}) : update({ evidence: undefined })} />
				<span>
					This source is a test result
					<span class="block font-normal text-ink-500">
						Tick it to record what was tested, how it went, and which acceptance criteria it proves.
					</span>
				</span>
			</label>
			{#if source.evidence}
				<p class="rounded-field bg-warning-50 px-3 py-2 text-xs text-warning-700">
					This is what someone reported; Lyriks does not re-run it. A check on a prototype does not
					prove the real product works.
				</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class={labelClass}>Kind of test
						<select aria-label="Kind of test" class={inputClass} value={source.evidence.kind}
							onchange={(e) => evidence({ kind: e.currentTarget.value as Evidence['kind'] })}>
							{#each KINDS as k (k.code)}<option value={k.code}>{k.label}</option>{/each}
						</select>
					</label>
					<label class={labelClass}>Result
						<select aria-label="Result" class={inputClass} value={source.evidence.result}
							onchange={(e) => evidence({ result: e.currentTarget.value as Evidence['result'] })}>
							{#each RESULTS as r (r.code)}<option value={r.code}>{r.label}</option>{/each}
						</select>
					</label>
					{#each FIELDS as field (field.key)}
						<label class={labelClass}>{field.label}
							<input class={inputClass} value={source.evidence[field.key]}
								oninput={(e) => evidence({ [field.key]: e.currentTarget.value })} />
							<span class={hintClass}>{field.hint}</span>
						</label>
					{/each}
					<label class={labelClass}>Acceptance criteria it proves
						<input class={inputClass} value={source.evidence.criterionIds.join(', ')}
							oninput={(e) => evidence({ criterionIds: e.currentTarget.value.split(',').map((id) => id.trim()).filter(Boolean) })} />
						<span class={hintClass}>Their ids, separated by commas.</span>
					</label>
				</div>
			{/if}
		</div>
	</div>
</details>
