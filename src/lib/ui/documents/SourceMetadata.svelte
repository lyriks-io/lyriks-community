<script lang="ts">
	import type { DocumentSource } from '$domain/documents';
	let { source, update }: { source: DocumentSource; update: (patch: Partial<DocumentSource>) => void } = $props();
	type Evidence = NonNullable<DocumentSource['evidence']>;
	const kinds: Evidence['kind'][] = ['unit', 'integration', 'e2e', 'visual', 'load', 'manual', 'prototype'];
	const results: Evidence['result'][] = ['not_run', 'passed', 'failed', 'blocked'];
	const fields = ['buildId', 'artifact', 'command', 'observedAt', 'provenance'] as const;
	const labels = { buildId: 'Build / commit', artifact: 'Artifact location', command: 'Test command',
		observedAt: 'Observed at (ISO date)', provenance: 'Reported by / origin' };
	function evidence(patch: Partial<Evidence>) {
		update({ evidence: { kind: 'manual', result: 'not_run', buildId: '', artifact: '', command: '',
			observedAt: '', provenance: '', criterionIds: [], ...source.evidence, ...patch } });
	}
	const fieldClass = 'rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-700';
</script>

<details class="rounded-field border border-line p-2">
	<summary class="cursor-pointer text-xs text-ink-600">
		Decision &amp; test evidence
		{#if source.decision} · {source.decision.status}{/if}
		{#if source.evidence} · {source.evidence.kind}: {source.evidence.result}{/if}
	</summary>
	<div class="mt-2 space-y-2">
		<label class="flex items-center gap-2 text-xs text-ink-600">Decision status
			<select class={fieldClass} value={source.decision?.status ?? ''}
				onchange={(e) => update({ decision: e.currentTarget.value
					? { status: e.currentTarget.value as NonNullable<DocumentSource['decision']>['status'] } : undefined })}>
				<option value="">Not a technical decision</option>
				<option value="proposed">Proposed</option><option value="accepted">Accepted</option>
				<option value="superseded">Superseded</option>
			</select>
		</label>
		<p class="text-xs text-ink-500">Put the chosen technology, versions, alternatives and rationale in the source note.</p>
		<label class="flex items-center gap-2 text-xs text-ink-600">
			<input type="checkbox" checked={!!source.evidence}
				onchange={(e) => e.currentTarget.checked ? evidence({}) : update({ evidence: undefined })} />
			Record a test result
		</label>
		{#if source.evidence}
			<p class="text-xs text-warning-700">Reported evidence, not independently verified. Prototype checks do not prove the real product works.</p>
			<div class="grid gap-2 sm:grid-cols-2">
				<label class="text-xs text-ink-600">Test kind
					<select class={fieldClass} value={source.evidence.kind}
						onchange={(e) => evidence({ kind: e.currentTarget.value as Evidence['kind'] })}>
						{#each kinds as kind}<option value={kind}>{kind}</option>{/each}
					</select>
				</label>
				<label class="text-xs text-ink-600">Result
					<select aria-label="Result" class={fieldClass} value={source.evidence.result}
						onchange={(e) => evidence({ result: e.currentTarget.value as Evidence['result'] })}>
						{#each results as result}<option value={result}>{result}</option>{/each}
					</select>
				</label>
				{#each fields as field}
					<label class="flex flex-col gap-1 text-xs text-ink-600">{labels[field]}
						<input class={fieldClass} value={source.evidence[field]}
							oninput={(e) => evidence({ [field]: e.currentTarget.value })} />
					</label>
				{/each}
				<label class="flex flex-col gap-1 text-xs text-ink-600">Criterion IDs (comma separated)
					<input class={fieldClass} value={source.evidence.criterionIds.join(', ')}
						oninput={(e) => evidence({ criterionIds: e.currentTarget.value.split(',').map((id) => id.trim()).filter(Boolean) })} />
				</label>
			</div>
		{/if}
	</div>
</details>
