<script lang="ts">
	import { Button, Icon, IconButton, Select, TextInput, Textarea } from '$ui/design-system';
	import {
		PRODUCT_LANE,
		addBranch,
		addTransition,
		flowOf,
		machineOf,
		removeActor,
		removeBranch,
		removeMachine,
		removeState,
		removeStep,
		removeTransition,
		removeUseCase,
		renameActor,
		renameMachine,
		renameRefusal,
		renameState,
		renameUseCase,
		linkStep,
		linkUseCase,
		sameName,
		setActorKind,
		setInitialState,
		setTakesPart,
		moveStep,
		updateBranch,
		updateStep,
		updateTransition,
		type DiagramBranchKind,
		type FunctionalDiagram
	} from '$domain/evolution';
	import type { DiagramSelection } from './selection';
	import type { DiagramWords } from './words';
	import type { DiagramLinkStatus } from './link-status.svelte';
	import LinkPicker from './LinkPicker.svelte';

	/**
	 * The fields of the element selected on the drawing (ac-evo-func-uml-edit):
	 * its name, who takes part, the lane and the text of a step with its ways out,
	 * the states a transition joins. Every change stays on the page until the
	 * diagram is saved. A name is committed on leaving its field, so a rename
	 * never stops halfway on a name already taken.
	 */
	interface Props {
		diagram: FunctionalDiagram;
		selection: DiagramSelection;
		onedit: (change: (d: FunctionalDiagram) => FunctionalDiagram) => void;
		onselect: (selection: DiagramSelection | null) => void;
		onopenflow: (useCase: string) => void;
		/** The diagram's words in the spec's language: each field's example reads in it (ac-evo-func-uml-edit). */
		words: DiagramWords;
		/** Enter in the text of a step adds the next step under it. */
		onaddstep?: (useCase: string, after: number) => void;
		/** Where the links to the product open; without it, nothing is offered to link (ac-evo-func-uml-link). */
		links?: DiagramLinkStatus;
	}
	let { diagram, selection, onedit, onselect, onopenflow, words, onaddstep, links }: Props = $props();

	/**
	 * A flow is written like a list (ac-evo-func-uml-edit): Enter in a step's text
	 * adds the next one (the notation keeps a step on one line, so Enter had
	 * nothing else to do), and Backspace in an empty one removes it.
	 */
	function stepKeys(useCase: string, at: number) {
		return (e: KeyboardEvent) => {
			if (e.isComposing) return;
			if (e.key === 'Enter' && !e.shiftKey && onaddstep) {
				e.preventDefault();
				onaddstep(useCase, at);
			} else if (e.key === 'Backspace' && (e.currentTarget as HTMLTextAreaElement).value === '') {
				e.preventDefault();
				onedit((d) => removeStep(d, useCase, at));
				onselect(at > 0 ? { kind: 'step', useCase, index: at - 1 } : null);
			}
		};
	}
	/** A way out just added opens with its condition focused, to be written at once. */
	let freshBranch = $state<string | null>(null);
	function addWayOut(useCase: string, at: number, kind: DiagramBranchKind, count: number) {
		onedit((d) => addBranch(d, useCase, at, kind));
		freshBranch = `${useCase}:${at}:${count}`;
	}
	function focusWhen(node: HTMLElement, on: boolean) {
		if (on) requestAnimationFrame(() => node.querySelector('input')?.focus());
	}

	/** The notation is line by line: a text typed on several lines is kept on one. */
	const oneLine = (v: string) => v.replace(/\s*\n\s*/g, ' ');
	/** A colon ends a condition in the notation; one typed in it reads as a comma. */
	const noColon = (v: string) => oneLine(v).replaceAll(':', ',');

	let refusal = $state<string | null>(null);
	$effect(() => {
		void selection;
		refusal = null;
	});
	/** Commit a rename on leaving the field, or say why it cannot be made. */
	function rename(from: string, to: string, taken: readonly string[], apply: (d: FunctionalDiagram, to: string) => FunctionalDiagram, next: (to: string) => DiagramSelection) {
		if (to.trim() === from) return;
		refusal = renameRefusal(to, from, taken);
		if (refusal) return;
		onedit((d) => apply(d, to.trim()));
		onselect(next(to.trim()));
	}
	const blurOnEnter = (e: KeyboardEvent) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur();

	const actor = $derived(selection.kind === 'actor' ? (diagram.actors.find((a) => sameName(a.name, selection.name)) ?? null) : null);
	const useCase = $derived(selection.kind === 'use_case' ? (diagram.useCases.find((u) => sameName(u.name, selection.name)) ?? null) : null);
	const flow = $derived(selection.kind === 'step' ? flowOf(diagram, selection.useCase) : null);
	const step = $derived(selection.kind === 'step' ? (flow?.steps[selection.index] ?? null) : null);
	const machine = $derived(
		selection.kind === 'machine' || selection.kind === 'state' || selection.kind === 'transition' ? machineOf(diagram, selection.object) : null
	);
	const pickedState = $derived(selection.kind === 'state' ? (machine?.states.find((s) => sameName(s, selection.name)) ?? null) : null);
	const transition = $derived(selection.kind === 'transition' ? (machine?.transitions[selection.index] ?? null) : null);

	const laneOptions = $derived([
		{ code: PRODUCT_LANE, label: 'The product' },
		...diagram.actors.map((a) => ({ code: a.name, label: a.kind === 'person' ? a.name : `${a.name} (system)` })),
		...(step && step.lane !== PRODUCT_LANE && !diagram.actors.some((a) => sameName(a.name, step.lane)) ? [{ code: step.lane, label: `${step.lane} (not declared)` }] : [])
	]);
	const stateOptions = $derived((machine?.states ?? []).map((s) => ({ code: s, label: s })));
	const BRANCH_OPTIONS = [
		{ code: 'refused', label: 'Refused when' },
		{ code: 'goes_wrong', label: 'Goes wrong when' }
	];
	const LABEL = 'block font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-ink-500 uppercase';
	// The design's filter chip (.ly-chip): a 1.5px rule border on paper; pressed, an ink fill.
	const CHIP = 'rounded-pill border-[1.5px] px-2 py-0.5 text-xs font-medium transition';
</script>

{#snippet chip(label: string, pressed: boolean, toggle: () => void)}
	<button
		type="button"
		class="{CHIP} {pressed ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink'}"
		aria-pressed={pressed}
		onclick={toggle}
	>
		{#if pressed}<Icon name="check" size={11} class="-ml-0.5 mr-0.5 inline" />{/if}{label}
	</button>
{/snippet}

{#snippet nameField(label: string, value: string, commit: (to: string) => void)}
	<label class="block space-y-1">
		<span class={LABEL}>{label}</span>
		{#key value}
			<TextInput {value} invalid={!!refusal} onblur={commit} onkeydown={blurOnEnter} />
		{/key}
	</label>
	{#if refusal}<p class="text-xs text-red-ink">{refusal}</p>{/if}
{/snippet}

<div class="space-y-3 text-sm">
	{#if actor}
		<p class="flex items-center gap-1.5 font-bold text-ink-900"><Icon name={actor.kind === 'person' ? 'user' : 'server'} size={14} />{actor.kind === 'person' ? 'Person' : 'Other system'}</p>
		{@render nameField('Name', actor.name, (to) =>
			rename(actor.name, to, [...diagram.actors.map((a) => a.name), PRODUCT_LANE], (d, n) => renameActor(d, actor.name, n), (n) => ({ kind: 'actor', name: n }))
		)}
		<div class="space-y-1">
			<span class={LABEL}>Is</span>
			<div class="flex flex-wrap gap-1.5">
				{@render chip('A person', actor.kind === 'person', () => onedit((d) => setActorKind(d, actor.name, 'person')))}
				{@render chip('Another system', actor.kind === 'system', () => onedit((d) => setActorKind(d, actor.name, 'system')))}
			</div>
		</div>
		<div class="space-y-1">
			<span class={LABEL}>Takes part in</span>
			{#if diagram.useCases.length === 0}
				<p class="text-xs text-ink-500 italic">No use case yet.</p>
			{:else}
				<div class="flex flex-wrap gap-1.5">
					{#each diagram.useCases as u (u.name)}
						{@const on = u.actors.some((a) => sameName(a, actor.name))}
						{@render chip(u.name, on, () => onedit((d) => setTakesPart(d, actor.name, u.name, !on)))}
					{/each}
				</div>
			{/if}
		</div>
		<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeActor(d, actor.name)), onselect(null))}>
			<Icon name="trash" size={12} />Remove {actor.name}
		</Button>
	{:else if useCase}
		<p class="flex items-center gap-1.5 font-bold text-ink-900"><Icon name="circle" size={14} />Use case</p>
		{@render nameField('Name', useCase.name, (to) =>
			rename(useCase.name, to, diagram.useCases.map((u) => u.name), (d, n) => renameUseCase(d, useCase.name, n), (n) => ({ kind: 'use_case', name: n }))
		)}
		<div class="space-y-1">
			<span class={LABEL}>Who takes part</span>
			{#if diagram.actors.length === 0}
				<p class="text-xs text-ink-500 italic">Add a person or a system first.</p>
			{:else}
				<div class="flex flex-wrap gap-1.5">
					{#each diagram.actors as a (a.name)}
						{@const on = useCase.actors.some((x) => sameName(x, a.name))}
						{@render chip(a.name, on, () => onedit((d) => setTakesPart(d, a.name, useCase.name, !on)))}
					{/each}
				</div>
			{/if}
		</div>
		{#if links}
			<LinkPicker kind="feature" link={useCase.link} {links} onchange={(link) => onedit((d) => linkUseCase(d, useCase.name, link))} />
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button size="sm" variant="outline" onclick={() => onopenflow(useCase.name)}>
				<Icon name="arrow-right" size={12} />{flowOf(diagram, useCase.name)?.steps.length ? 'Open its flow' : 'Write its flow'}
			</Button>
			<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeUseCase(d, useCase.name)), onselect(null))}>
				<Icon name="trash" size={12} />Remove it and its flow
			</Button>
		</div>
	{:else if step && selection.kind === 'step'}
		{@const at = selection.index}
		{@const of = selection.useCase}
		<p class="font-bold text-ink-900">Step {at + 1} of {flow?.steps.length ?? 1}</p>
		<label class="block space-y-1">
			<span class={LABEL}>Who does it</span>
			<Select value={step.lane} options={laneOptions} onchange={(lane) => lane && onedit((d) => updateStep(d, of, at, { lane }))} />
		</label>
		<label class="block space-y-1">
			<span class={LABEL}>What happens</span>
			<Textarea value={step.text} rows={2} oninput={(text) => onedit((d) => updateStep(d, of, at, { text: oneLine(text) }))} onkeydown={stepKeys(of, at)} />
		</label>
		{#if links}
			<LinkPicker kind="action" link={step.link} {links} onchange={(link) => onedit((d) => linkStep(d, of, at, link))} />
		{/if}
		<div class="space-y-2">
			<span class={LABEL}>Ways out</span>
			{#each step.branches as branch, b (b)}
				<div class="space-y-1.5 rounded-field border border-line bg-toner-1 p-2">
					<div class="flex items-center gap-1.5">
						<Select
							value={branch.kind}
							options={BRANCH_OPTIONS}
							class="flex-1"
							onchange={(kind) => kind && onedit((d) => updateBranch(d, of, at, b, { kind: kind as DiagramBranchKind }))}
						/>
						<IconButton name="x" label="Remove this way out" danger onclick={() => onedit((d) => removeBranch(d, of, at, b))} />
					</div>
					<div use:focusWhen={freshBranch === `${of}:${at}:${b}`}>
						<TextInput value={branch.when} placeholder={words.examples.wayOutWhen} oninput={(when) => onedit((d) => updateBranch(d, of, at, b, { when: noColon(when) }))} />
					</div>
					<TextInput value={branch.then} placeholder={words.examples.wayOutThen} oninput={(then) => onedit((d) => updateBranch(d, of, at, b, { then: oneLine(then) }))} />
				</div>
			{/each}
			<div class="flex flex-wrap gap-1.5">
				<Button size="sm" variant="outline" onclick={() => addWayOut(of, at, 'refused', step.branches.length)}><Icon name="plus" size={12} />Refused when…</Button>
				<Button size="sm" variant="outline" onclick={() => addWayOut(of, at, 'goes_wrong', step.branches.length)}><Icon name="plus" size={12} />Goes wrong when…</Button>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
			<Button size="sm" variant="ghost" disabled={at === 0} onclick={() => (onedit((d) => moveStep(d, of, at, -1)), onselect({ kind: 'step', useCase: of, index: at - 1 }))}>
				<Icon name="arrow-up" size={12} />Up
			</Button>
			<Button
				size="sm"
				variant="ghost"
				disabled={at >= (flow?.steps.length ?? 1) - 1}
				onclick={() => (onedit((d) => moveStep(d, of, at, 1)), onselect({ kind: 'step', useCase: of, index: at + 1 }))}
			>
				<Icon name="arrow-down" size={12} />Down
			</Button>
			<Button size="sm" variant="ghost" class="ml-auto text-danger-600" onclick={() => (onedit((d) => removeStep(d, of, at)), onselect(null))}>
				<Icon name="trash" size={12} />Remove
			</Button>
		</div>
	{:else if machine && selection.kind === 'machine'}
		<p class="font-bold text-ink-900">Thing the change moves</p>
		{@render nameField('Name', machine.object, (to) =>
			rename(machine.object, to, diagram.machines.map((m) => m.object), (d, n) => renameMachine(d, machine.object, n), (n) => ({ kind: 'machine', object: n }))
		)}
		<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeMachine(d, machine.object)), onselect(null))}>
			<Icon name="trash" size={12} />Remove it and its states
		</Button>
	{:else if machine && pickedState && selection.kind === 'state'}
		{@const state = pickedState}
		{@const isFirst = sameName(machine.states[0] ?? '', state)}
		<p class="font-bold text-ink-900">State of {machine.object}</p>
		{@render nameField('Name', state, (to) =>
			rename(state, to, machine.states, (d, n) => renameState(d, machine.object, state, n), (n) => ({ kind: 'state', object: machine.object, name: n }))
		)}
		{#if isFirst}
			<p class="flex items-center gap-1.5 text-xs text-ink-600"><span class="inline-block size-2.5 bg-ink-900"></span>Where {machine.object} starts</p>
		{:else}
			<Button size="sm" variant="outline" onclick={() => onedit((d) => setInitialState(d, machine.object, state))}>Make it where {machine.object} starts</Button>
		{/if}
		<div class="flex flex-wrap gap-1.5">
			<Button
				size="sm"
				variant="outline"
				onclick={() => {
					const added = addTransition(diagram, machine.object, state);
					onedit(() => added.diagram);
					if (added.index >= 0) onselect({ kind: 'transition', object: machine.object, index: added.index });
				}}
			>
				<Icon name="plus" size={12} />Transition from here
			</Button>
			<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeState(d, machine.object, state)), onselect(null))}>
				<Icon name="trash" size={12} />Remove
			</Button>
		</div>
	{:else if machine && transition && selection.kind === 'transition'}
		{@const at = selection.index}
		<p class="font-bold text-ink-900">Transition of {machine.object}</p>
		<div class="grid grid-cols-2 gap-2">
			<label class="block space-y-1">
				<span class={LABEL}>From</span>
				<Select value={transition.from} options={stateOptions} onchange={(from) => from && onedit((d) => updateTransition(d, machine.object, at, { from }))} />
			</label>
			<label class="block space-y-1">
				<span class={LABEL}>To</span>
				<Select value={transition.to} options={stateOptions} onchange={(to) => to && onedit((d) => updateTransition(d, machine.object, at, { to }))} />
			</label>
		</div>
		<label class="block space-y-1">
			<span class={LABEL}>Caused by</span>
			<TextInput value={transition.trigger} placeholder={words.examples.trigger} oninput={(trigger) => onedit((d) => updateTransition(d, machine.object, at, { trigger: oneLine(trigger) }))} />
		</label>
		<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeTransition(d, machine.object, at)), onselect(null))}>
			<Icon name="trash" size={12} />Remove
		</Button>
	{:else}
		<p class="text-xs text-ink-500">This element is no longer in the diagram.</p>
	{/if}
</div>
