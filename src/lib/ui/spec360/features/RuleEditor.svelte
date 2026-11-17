<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { RULE_CATEGORIES, objectOf, parseEditableRule, ruleTarget } from '$application/spec360/rule-edit';
	import { useValidation } from '../validation.svelte';
	import { clientId } from '$ui/shell/live-sync.client';
	import { refusalOf } from '$ui/shell/save-queue';
	import { DIALOG, FIELD, PRESS_FILL, QUIET } from '../page/look';

	let { featureId, actionId, ruleId, close }: { featureId: string; actionId: string; ruleId?: string; close: () => void } = $props();
	const validation = useValidation();
	let dialog = $state<HTMLDialogElement | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let accepted = $state(false);
	let discarding = $state(false);
	let message = $state('');
	let version = $state('');
	let category = $state('');
	let reason = $state('');
	let conditionMode = $state('always');
	let statePath = $state('');
	let operator = $state('equals');
	let valueType = $state('text');
	let value = $state('');
	let conditionJson = $state('');
	let effectKind = $state('');
	let effectWhy = $state('');
	let refusal = $state('');
	let effectJson = $state('');
	let originalEffect: Record<string, unknown> = {};
	let originalCondition: Record<string, unknown> | undefined;
	let initialConditionFields = '';
	let initial = $state('');
	const signature = $derived(JSON.stringify([category, reason, conditionMode, statePath, operator, valueType, value, conditionJson, effectKind, effectWhy, refusal, effectJson]));
	const dirty = $derived(!loading && !accepted && signature !== initial);
	const operators = ['equals', 'not_equals', 'greater_or_equal', 'lower_or_equal', 'greater_than', 'lower_than', 'contains', 'is_true', 'is_false', 'exists'];
	const noValue = $derived(['is_true', 'is_false', 'exists'].includes(operator));

	async function load() {
		try {
			const query = new URLSearchParams({ projectId: validation.source.projectId, featureId });
			const response = await fetch(`/api/behavior/feature?${query}`);
			if (!response.ok) throw new Error(await refusalOf(response, 'The rule could not be read'));
			const body = await response.json();
			const target = ruleTarget(body.snapshot, actionId, ruleId);
			if (!target) throw new Error('This action or rule is no longer in the specification. Reload the page.');
			version = target.updatedAt;
			const rule = target.rule;
			category = typeof rule?.category === 'string' ? rule.category : '';
			reason = typeof rule?.description === 'string' ? rule.description : '';
			const condition = objectOf(rule?.condition);
			originalCondition = condition ?? undefined;
			conditionJson = condition ? JSON.stringify(condition, null, 2) : '';
			if (condition && typeof condition.left === 'string' && typeof condition.operator === 'string' && operators.includes(condition.operator) && Object.keys(condition).every((key) => ['left', 'operator', 'right'].includes(key)) && (condition.right == null || ['string', 'number', 'boolean'].includes(typeof condition.right))) {
				conditionMode = 'when'; statePath = condition.left; operator = condition.operator;
				valueType = condition.right === null ? 'null' : typeof condition.right === 'number' ? 'number' : typeof condition.right === 'boolean' ? 'boolean' : 'text';
				value = condition.right == null ? '' : String(condition.right);
			} else conditionMode = condition ? 'advanced' : 'always';
			originalEffect = objectOf(rule?.effect) ?? {};
			effectJson = rule ? JSON.stringify(originalEffect, null, 2) : '';
			effectKind = !rule ? '' : ['block_action', 'allow_action'].includes(String(originalEffect.type)) ? String(originalEffect.type) : 'advanced';
			effectWhy = typeof originalEffect.description === 'string' ? originalEffect.description : '';
			refusal = typeof originalEffect.reason === 'string' ? originalEffect.reason : '';
			initialConditionFields = JSON.stringify([conditionMode, statePath, operator, valueType, value, conditionJson]);
		} catch (error) { message = error instanceof Error ? error.message : 'The rule could not be read.'; }
		finally { loading = false; initial = signature; }
	}
	$effect(() => { void load(); });
	$effect(() => { dialog?.showModal(); });
	beforeNavigate((navigation) => {
		if (dirty || saving) { navigation.cancel(); message = 'Save or cancel this rule before leaving.'; }
	});

	function cancel() {
		if (saving) return;
		if (discarding) { discarding = false; return; }
		if (dirty) { discarding = true; return; }
		close();
	}
	async function refresh() {
		await invalidateAll();
		close();
	}
	async function save() {
		if (saving || !version || (!accepted && (!validation.source.canWrite || !validation.draft))) return;
		message = '';
		try {
			if (accepted) { saving = true; await refresh(); return; }
			let condition: unknown;
			if (conditionMode === 'advanced') {
				if (!conditionJson.trim()) throw new Error('Write a structured condition, or choose Always.');
				condition = JSON.parse(conditionJson);
			}
			if (conditionMode === 'when') {
				if (!statePath.trim()) throw new Error('Name the state this condition reads.');
				if (!noValue && valueType === 'number' && (!value.trim() || !Number.isFinite(Number(value)))) throw new Error('Enter a finite number for the comparison.');
				if (!noValue && valueType === 'boolean' && !['true', 'false'].includes(value)) throw new Error('Choose true or false for the comparison.');
				const right = valueType === 'number' ? Number(value) : valueType === 'boolean' ? value === 'true' : valueType === 'null' ? null : value;
				condition = { left: statePath, operator, ...(!noValue ? { right } : {}) };
			}
			if (JSON.stringify([conditionMode, statePath, operator, valueType, value, conditionJson]) === initialConditionFields) condition = originalCondition;
			const effect = effectKind === 'advanced' ? JSON.parse(effectJson) : { ...(originalEffect.type === effectKind ? originalEffect : {}), type: effectKind, description: effectWhy, ...(effectKind === 'block_action' ? { reason: refusal } : {}) };
			const parsed = parseEditableRule({ category, description: reason, condition, effect });
			if (!parsed.ok) throw new Error(parsed.reason);
			saving = true;
			const response = await fetch(`/projects/${encodeURIComponent(validation.source.projectId)}/spec/edit`, {
				method: 'POST', headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
				body: JSON.stringify({ op: 'upsert_rule', featureId, actionId, ...(ruleId ? { ruleId } : {}), expectedUpdatedAt: version, rule: parsed.value })
			});
			if (!response.ok) throw new Error(await refusalOf(response, 'The rule was not saved'));
			accepted = true;
			await refresh();
		} catch (error) { message = accepted ? 'The rule was saved, but the page could not refresh. Refresh before editing it again.' : error instanceof Error ? error.message : 'The rule was not saved. Check your connection.'; }
		finally { saving = false; }
	}
</script>

<svelte:window onbeforeunload={(event) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } }} />
<dialog bind:this={dialog} class="{DIALOG} m-auto max-h-[90vh] w-[min(700px,calc(100vw-32px))] overflow-y-auto p-6 text-ink backdrop:bg-ink/40" aria-label={ruleId ? 'Edit rule' : 'Add a rule'} oncancel={(event) => { event.preventDefault(); cancel(); }} onkeydown={(event) => { if (event.key === 'Escape') event.stopPropagation(); else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') { event.stopPropagation(); event.preventDefault(); } }}>
	<h3 class="m-0 mb-4 text-xl font-bold">{ruleId ? 'Edit rule' : 'Add a rule'}</h3>
	{#if loading}<p role="status">Reading the saved rule…</p>{:else if version}
		<form onsubmit={(event) => { event.preventDefault(); void save(); }}>
			<fieldset disabled={saving || accepted || discarding || !validation.source.canWrite || !validation.draft} class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
				<label class="flex flex-col gap-1 text-sm font-semibold">Category<select aria-label="Category" bind:value={category} required class="{FIELD} p-2"><option value="">Choose a category…</option>{#each RULE_CATEGORIES as item}<option value={item}>{item.replaceAll('_', ' ')}</option>{/each}</select></label>
				<label class="flex flex-col gap-1 text-sm font-semibold">Why this rule exists<textarea bind:value={reason} rows="2" maxlength="4000" required class="{FIELD} p-2"></textarea></label>
				<label class="flex flex-col gap-1 text-sm font-semibold">Condition<select aria-label="Condition" bind:value={conditionMode} class="{FIELD} p-2"><option value="always">Always</option><option value="when">When a state matches</option><option value="advanced">Advanced structured condition</option></select></label>
				{#if conditionMode === 'when'}
					<label class="flex flex-col gap-1 text-sm">State path<input bind:value={statePath} class="{FIELD} p-2" required /></label>
					<label class="flex flex-col gap-1 text-sm">Comparison<select aria-label="Comparison" bind:value={operator} class="{FIELD} p-2">{#each operators as item}<option value={item}>{item.replaceAll('_', ' ')}</option>{/each}</select></label>
					{#if !noValue}<div class="grid grid-cols-2 gap-2"><label class="flex flex-col gap-1 text-sm">Value type<select aria-label="Value type" bind:value={valueType} class="{FIELD} p-2"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option></select></label><label class="flex flex-col gap-1 text-sm">Value{#if valueType === 'boolean'}<select aria-label="Value" bind:value class="{FIELD} p-2"><option value="">Choose…</option><option value="true">True</option><option value="false">False</option></select>{:else}<input bind:value disabled={valueType === 'null'} class="{FIELD} p-2" />{/if}</label></div>{/if}
				{:else if conditionMode === 'advanced'}<label class="flex flex-col gap-1 text-sm">Condition JSON<textarea bind:value={conditionJson} rows="6" class="{FIELD} p-2 font-evo-mono text-xs" spellcheck="false"></textarea></label>{/if}
				<label class="flex flex-col gap-1 text-sm font-semibold">Effect<select aria-label="Effect" bind:value={effectKind} class="{FIELD} p-2" required><option value="">Choose an explicit effect…</option><option value="block_action">Refuse the action</option><option value="allow_action">Allow the action</option><option value="advanced">Advanced structured effect</option></select></label>
				{#if effectKind === 'advanced'}<label class="flex flex-col gap-1 text-sm">Effect JSON<textarea bind:value={effectJson} rows="6" class="{FIELD} p-2 font-evo-mono text-xs" spellcheck="false"></textarea></label>{:else if effectKind}<label class="flex flex-col gap-1 text-sm">What this effect does<textarea bind:value={effectWhy} rows="2" required class="{FIELD} p-2"></textarea></label>{#if effectKind === 'block_action'}<label class="flex flex-col gap-1 text-sm">Refusal message<input bind:value={refusal} required class="{FIELD} p-2" /></label>{/if}{/if}
				<p class="m-0 text-xs text-ink-3">Conditions and effects are explicit. The text above is never translated into a guard automatically.</p>
			</fieldset>
			{#if discarding}<div class="mt-4 border border-line p-3"><p class="m-0 text-sm" role="alert">Discard this rule edit? These changes have not been saved.</p><div class="mt-3 flex justify-end gap-3"><button type="button" class={QUIET} onclick={() => discarding = false}>Keep editing</button><button type="button" class="{PRESS_FILL} px-4 py-2 text-xs" onclick={close}>Discard changes</button></div></div>{:else}<div class="mt-5 flex justify-end gap-3"><button type="button" class={QUIET} disabled={saving} onclick={cancel}>Cancel</button><button type="submit" class="{PRESS_FILL} px-4 py-2 text-xs" disabled={saving || (!accepted && (!validation.source.canWrite || !validation.draft))}>{saving ? 'Saving…' : accepted ? 'Refresh saved rule' : 'Save rule'}</button></div>{/if}
		</form>
	{:else}<button type="button" class={QUIET} onclick={close}>Close</button>{/if}
	{#if message}<p class="mt-3 text-sm text-red-ink" role="alert">{message}</p>{/if}
</dialog>
