<script lang="ts">
	import Gauge from '$ui/design-system/Gauge.svelte';
	import { afterNavigate, goto, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Logo, pushToast } from '$ui/design-system';
	import { styledProjectName } from '$domain/foundation';
	import { rebuildsSpec, sourceModeOf, startPrompt, wayOf, type ScratchPace, type ScratchSource, type StartWay } from '$domain/portfolio/project-start';
	import LlmConnection from '$ui/retrospec/LlmConnection.svelte';
	import LearnSourceCard from './LearnSourceCard.svelte';
	import { LEARN_SOURCES, pickLearnSource } from './learn-sources';
	import { watchAiConnection } from './ai-connection.client';
	import { closeOnboarding, onboardingOpen, openOnboarding } from './onboarding.svelte';
	import { keepEditMode } from '$ui/spec360/edit-mode-memory.client';
	import CommunityLock from './CommunityLock.svelte';
	import { PROJECT_NOT_CREATED, refusalToast } from './offer-refusal';

	// "Create your project", in four steps (the design's onboarding): its name;
	// an existing product or a new one; how Lyriks learns it (codebase,
	// documents, both, or described by hand) or, from scratch, where it starts
	// and how the AI helps; then the prompt to paste into the person's LLM. The
	// project is created when the prompt is shown, since the prompt names it;
	// finishing records how it started and opens the tab it starts on. The
	// sources are three tiles, each saying what happens and what it reads, with
	// a tick box saying it is picked (criterion 1ba1817e), and the prompt
	// step holds the prompt alone: being emailed when the analysis is ready is a
	// small icon toggle beside its buttons. A prompt that rebuilds the spec
	// waits for the person's LLM: "I ran the prompt" shows once the LLM has
	// called Lyriks about the project, since before that the analysis would only
	// wait. Skipping never loses the way in (see `skip`). A new product can also
	// start without any AI: the project opens at once on its Specification 360°,
	// written by hand, and the AI joins whenever the person connects it. A new
	// product is described before anything changes it: evolutions start once its
	// specification holds a feature (criterion 40bef6da).
	let { hasProject }: { hasProject: boolean } = $props();

	const STEPS = 4;
	let step = $state(1);
	let name = $state('');
	let product = $state<'existing' | 'scratch' | null>(null);
	let from = $state({ code: false, docs: false, manual: false });
	let source = $state<ScratchSource>('document');
	/** How the AI helps build a new product, or `myself`: no AI for now, no prompt to paste. */
	let help = $state<ScratchPace | 'myself'>('block');
	let emailWhenReady = $state(true);
	let created = $state<{ id: string; name: string } | null>(null);
	let busy = $state(false);
	let copied = $state(false);
	/** When the person's LLM last called Lyriks about the project created here, null before its first call. */
	let aiSeenAt = $state<string | null>(null);
	let now = $state(Date.now());

	const open = $derived(onboardingOpen());
	/** The name as the project will read it: the server keeps it in the one style project names read in (criterion 69aa0fef). */
	const styled = $derived(styledProjectName(name));
	const pName = $derived(styled || 'My project');
	const way = $derived<StartWay | null>(product ? wayOf(product, from) : null);
	const picked = $derived((from.code ? 1 : 0) + (from.docs ? 1 : 0) + (from.manual ? 1 : 0));
	const byHand = $derived(way === 'scratch' && help === 'myself');
	/** Community holds one project: New Project shows the Solo Builder offer instead of the form (EVO-001). */
	const refused = $derived(page.data.projectCreation?.ok === false && !created);

	// A reader with no project at all is welcomed with it, once per visit.
	const SEEN = 'lyriks.onboarding.offered';
	$effect(() => {
		if (hasProject || page.url.pathname !== '/') return;
		try {
			if (sessionStorage.getItem(SEEN)) return;
			sessionStorage.setItem(SEEN, '1');
		} catch {
			return;
		}
		openOnboarding();
	});

	// A link opens it from any page, so an AI can hand it to the person:
	// `?new-project`, or `?new-project=Kutt` with the name already typed. The
	// parameter is dropped once read, so a reload does not open it again. Read
	// after each navigation, the first load included.
	const NEW_PROJECT = 'new-project';
	afterNavigate(({ to }) => {
		const asked = to?.url.searchParams.get(NEW_PROJECT);
		if (asked === null || asked === undefined || !to) return;
		reset();
		name = asked.trim();
		openOnboarding();
		const url = new URL(to.url);
		url.searchParams.delete(NEW_PROJECT);
		// On the first load this runs while the router is still starting: rewrite on the next turn.
		setTimeout(() => replaceState(url, page.state));
	});

	function reset() {
		step = 1;
		name = '';
		product = null;
		from = { code: false, docs: false, manual: false };
		source = 'document';
		help = 'block';
		emailWhenReady = true;
		created = null;
		copied = false;
		aiSeenAt = null;
	}

	// The project exists from the prompt step on: its AI is heard from then, while the dialog is open.
	$effect(() => {
		const id = open ? created?.id : undefined;
		if (!id) return;
		const stop = watchAiConnection(id, () => {
			aiSeenAt = new Date().toISOString();
			now = Date.now();
		});
		const tick = setInterval(() => (now = Date.now()), 30_000);
		return () => {
			stop();
			clearInterval(tick);
		};
	});

	/**
	 * "Skip for now" never loses the way in. Before the project exists, what was
	 * typed and picked stays: the next opening (New project in the project menu,
	 * or Home) resumes at the same step. Once it exists, how it starts is
	 * recorded and the project opens where that start goes on (the
	 * Retrospecification's Source step with its prompt, or the Specification
	 * 360°); only the analysis is not handed to the LLM.
	 */
	function skip() {
		if (created && way) return void begin(false);
		closeOnboarding();
	}

	const projectUrl = (id: string, tab: string) => `${page.url.origin}/projects/${encodeURIComponent(id)}/${tab}`;
	const prompt = $derived(
		created && way
			? startPrompt({
					way,
					name: created.name,
					projectId: created.id,
					scratch: way === 'scratch' && help !== 'myself' ? { source, pace: help } : undefined,
					emailWhenReady: rebuildsSpec(way) && emailWhenReady ? { url: projectUrl(created.id, 'retrospec') } : null
				})
			: ''
	);

	const intro = $derived.by(() => {
		switch (way) {
			case 'code_and_docs':
				return 'Open your LLM (Claude Code, Cursor…) in the repo folder, with the Lyriks MCP connected, give it your documents and paste this prompt.';
			case 'code':
				return 'Open your LLM (Claude Code, Cursor…) in the repo folder, with the Lyriks MCP connected, and paste this prompt.';
			case 'docs':
				return 'Open your LLM with the Lyriks MCP connected, give it your documents, and paste this prompt.';
			case 'manual':
				return 'Open your LLM with the Lyriks MCP connected and paste this prompt. It will interview you and fill the specification.';
			default:
				return source === 'document'
					? 'Open your LLM with the Lyriks MCP connected, give it your document and paste this prompt.'
					: 'Open your LLM with the Lyriks MCP connected and paste this prompt. It will ask about your idea first.';
		}
	});

	const json = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	/** The workspace the switcher shows owns the new project, for a member of several (rule fb69bf09). */
	const switcherWorkspace = () => (typeof page.data.activeWorkspace === 'string' ? { workspaceId: page.data.activeWorkspace } : {});

	async function failed(res: Response, fallback: string): Promise<boolean> {
		if (res.ok) return false;
		// A refusal reads in the server's words, never its raw answer; Community's is an offer with View plans (EVO-006).
		pushToast(await refusalToast(res, fallback, !!page.data.onlineHelp));
		return true;
	}

	/** The project under the name typed: created the first time, renamed when the name changed since. */
	async function ensureProject(w: StartWay): Promise<boolean> {
		if (created && created.name === styled) return true;
		busy = true;
		try {
			const res = created
				? await fetch(`/api/projects/${encodeURIComponent(created.id)}`, json('PATCH', { name: name.trim() }))
				: await fetch('/api/projects', json('POST', { name: name.trim(), sourceMode: sourceModeOf(w), ...switcherWorkspace() }));
			if (await failed(res, created ? 'The project was not renamed.' : PROJECT_NOT_CREATED)) return false;
			created = created ? { ...created, name: styled } : { id: ((await res.json()) as { projectId: string }).projectId, name: styled };
			return true;
		} finally {
			busy = false;
		}
	}

	/** The prompt names the project: it exists from the moment the prompt is shown. Without AI, it opens at once. */
	async function toPrompt() {
		if (!way || busy) return;
		if (!(await ensureProject(way))) return;
		if (byHand) return begin(false);
		copied = false;
		step = 4;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(prompt);
			copied = true;
			pushToast({ level: 'success', message: 'Prompt copied: paste it into your LLM' });
		} catch {
			pushToast({ level: 'error', message: 'The prompt could not be copied: select it and copy it by hand' });
		}
	}

	/** Records how the project starts and opens it there; `launch` also hands the analysis to the LLM the person ran the prompt in. */
	async function begin(launch: boolean) {
		if (!created || !way || busy) return;
		busy = true;
		try {
			const id = encodeURIComponent(created.id);
			if (await failed(await fetch(`/api/projects/${id}/start`, json('POST', { way })), 'How the project starts was not recorded')) return;
			if (rebuildsSpec(way)) {
				const mode = way === 'docs' ? 'docs' : 'repo';
				const acts = launch ? [{ op: 'start', mode }, { op: 'launch' }] : [{ op: 'start', mode }];
				const res = await fetch(`/api/projects/${id}/retrospec`, json('POST', { acts }));
				if (await failed(res, 'The Reverse-Specification did not start')) return;
			}
			const target = rebuildsSpec(way) ? 'retrospec' : 'spec';
			// Written by hand: the project opens ready to be written, on what to fill first (criterion 5c939ad3).
			if (byHand) keepEditMode(created.id);
			closeOnboarding();
			reset();
			if (way === 'manual') pushToast({ level: 'success', message: 'Knowledge is open: fill it in with your LLM, section by section' });
			if (way === 'scratch') pushToast({ level: 'success', message: 'Knowledge is open: describe your product, section by section' });
			await goto(`/projects/${id}/${target}`);
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	function back() {
		step = step === 4 ? 3 : Math.max(1, step - 1);
		copied = false;
	}

	// The design's choice card (.ly-choice): sand at rest, paper with an ink border once chosen.
	const card = (on: boolean) => (on ? 'border-2 border-ink bg-paper' : 'border border-transparent bg-surface hover:border-line');
	const CARD = 'flex min-w-0 flex-[1_1_220px] cursor-pointer flex-col gap-2 p-[18px] text-left text-evo-ink';
	const H2 = 'm-0 text-[1.625rem] leading-[1.2] font-bold tracking-[-0.02em] text-ink';
	const PRIMARY = 'min-h-11 border-[1.5px] px-5 text-[0.8125rem] font-bold tracking-[0.07em] uppercase';
	const enabled = (ok: boolean) => (ok ? 'pressable cursor-pointer border-ink bg-evo-violet text-paper' : 'cursor-not-allowed border-evo-grey bg-evo-grey text-evo-ink-3');
</script>

{#snippet icon(path: string)}
	<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={path}></path></svg>
{/snippet}

{#if open}
	<div role="dialog" aria-modal="true" aria-label="Create your project" class="fixed inset-0 z-[80] box-border flex animate-lk-fade justify-center overflow-y-auto bg-canvas px-4 py-10 font-evo">
		<div class="flex w-full max-w-[720px] flex-col gap-[22px]">
			<div class="flex items-center justify-between gap-3">
				<span class="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-evo-ink">
					<Logo size={26} />Lyriks
				</span>
				<button type="button" onclick={skip} class="min-h-9 cursor-pointer border-0 bg-transparent px-3 text-sm font-semibold text-ink underline decoration-[1.5px] underline-offset-[5px]">Skip for now</button>
			</div>
			{#if refused}
				<CommunityLock lock="secondProject" title="Create your project" />
			{:else}
			<div class="flex flex-col gap-2">
				<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">Step {step} of {STEPS}</span>
				<!-- The design's step progress: one orange cell per step, slanted (criterion b663dee4). -->
				<Gauge parts={[{ value: step, tone: 'bg-orange' }]} total={STEPS} counts height={4} />
			</div>
			<div class="flex flex-col gap-[22px] border-2 border-ink bg-paper p-8 shadow-pop max-[760px]:p-5">
				{#if step === 1}
					<div class="flex flex-col gap-[18px]">
						<div class="flex flex-col gap-1.5">
							<h2 class={H2}>Welcome to Lyriks</h2>
							<span class="text-[0.9375rem] text-evo-ink-3">Let’s create your {hasProject ? 'next' : 'first'} project. What is it called?</span>
						</div>
						<label class="flex flex-col gap-1.5">
							<span class="font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Project name</span>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								bind:value={name}
								autofocus
								placeholder="Name of your project"
								name="lk-new-project-name"
								autocomplete="off"
								autocorrect="off"
								spellcheck="false"
								data-lpignore="true"
								data-1p-ignore="true"
								onkeydown={(e) => e.key === 'Enter' && name.trim() && (step = 2)}
								class="box-border min-h-12 border-[1.5px] border-ink-3 bg-surface-sunken px-3.5 text-base text-ink outline-none placeholder:text-ink-3 focus:border-blue"
							/>
						</label>
						<div class="flex justify-end">
							<button type="button" aria-disabled={!name.trim()} onclick={() => name.trim() && (step = 2)} class="{PRIMARY} {enabled(!!name.trim())}">Continue →</button>
						</div>
					</div>
				{:else if step === 2}
					<div class="flex flex-col gap-[18px]">
						<h2 class={H2}>Is {pName} an existing product?</h2>
						<div class="flex flex-wrap items-stretch gap-3">
							<button type="button" onclick={() => { product = 'existing'; step = 3; }} class="{CARD} {card(product === 'existing')}">
								<span class="flex items-center justify-between gap-2">
									<span aria-hidden="true" class="flex size-[38px] items-center justify-center border-[1.5px] border-ink bg-paper text-ink">{@render icon('M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8')}</span>
									<span class="border-[1.5px] border-blue px-2 py-0.5 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-blue-ink uppercase">Existing product</span>
								</span>
								<span class="text-base font-bold">It already exists</span>
								<span class="text-[0.8125rem] leading-normal text-evo-ink-3">There is code, documents or both. Lyriks rebuilds its specification first.</span>
							</button>
							<button type="button" onclick={() => { product = 'scratch'; step = 3; }} class="{CARD} {card(product === 'scratch')}">
								<span class="flex items-center justify-between gap-2">
									<span aria-hidden="true" class="flex size-[38px] items-center justify-center border-[1.5px] border-ink bg-paper text-ink">
										<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"></path><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"></path></svg>
									</span>
									<span class="border-[1.5px] border-blue px-2 py-0.5 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-blue-ink uppercase">New product</span>
								</span>
								<span class="text-base font-bold">From scratch</span>
								<span class="text-[0.8125rem] leading-normal text-evo-ink-3">Nothing exists yet. Describe your idea and Lyriks writes its first specification with you.</span>
							</button>
						</div>
					</div>
				{:else if step === 3 && product === 'existing'}
					<div class="flex flex-col gap-[18px]">
						<div class="flex flex-col gap-1.5">
							<h2 class={H2}>How should Lyriks learn {pName}?</h2>
							<span class="text-[0.9375rem] text-evo-ink-3">Pick one or several.</span>
						</div>
						<div class="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] items-stretch gap-3">
							{#each LEARN_SOURCES as source (source.key)}
								<LearnSourceCard {source} picked={from[source.key]} onpick={() => (from = pickLearnSource(from, source.key))} />
							{/each}
						</div>
						<div class="flex flex-wrap items-center justify-end gap-3">
							{#if picked === 0}<span class="text-[0.8125rem] text-ink-3">Pick one or several sources.</span>{/if}
							<button type="button" aria-disabled={picked === 0 || busy} onclick={toPrompt} class="{PRIMARY} {enabled(picked > 0 && !busy)}">Continue →</button>
						</div>
					</div>
				{:else if step === 3}
					<div class="flex flex-col gap-[18px]">
						<h2 class={H2}>Where does {pName} start from?</h2>
						<!-- Without AI, nothing reads the document or asks about the idea: the choice waits, dimmed, for when the AI joins. -->
						<div class="flex flex-wrap items-stretch gap-3 transition-opacity duration-200 {byHand ? 'opacity-45' : ''}" title={byHand ? 'Your AI uses it once you connect it' : undefined}>
							<button type="button" aria-pressed={source === 'document'} onclick={() => (source = 'document')} class="{CARD} gap-1.5 p-4 {card(source === 'document')}">
								<span class="text-[0.9375rem] font-bold">From a document</span>
								<span class="text-[0.8125rem] leading-normal text-evo-ink-3">Requirements, a brief, slides or mock-ups. The AI reads it before suggesting anything.</span>
							</button>
							<button type="button" aria-pressed={source === 'idea'} onclick={() => (source = 'idea')} class="{CARD} gap-1.5 p-4 {card(source === 'idea')}">
								<span class="text-[0.9375rem] font-bold">From an idea</span>
								<span class="text-[0.8125rem] leading-normal text-evo-ink-3">Nothing written yet. Share your idea and your vision for the project, and we’ll shape the brief together.</span>
							</button>
						</div>
						<div class="flex flex-col gap-2.5">
							<span class="text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">How should the AI help you?</span>
							<div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-stretch gap-3">
								<button type="button" aria-pressed={help === 'block'} onclick={() => (help = 'block')} class="{CARD} gap-1.5 p-4 {card(help === 'block')}">
									<span class="text-[0.9375rem] font-bold">Block by block, with me</span>
									<span class="text-[0.8125rem] leading-normal text-evo-ink-3">One section at a time: features, users, experience, data. You validate before it moves on.</span>
								</button>
								<button type="button" aria-pressed={help === 'all'} onclick={() => (help = 'all')} class="{CARD} gap-1.5 p-4 {card(help === 'all')}">
									<span class="text-[0.9375rem] font-bold">Everything at once</span>
									<span class="text-[0.8125rem] leading-normal text-evo-ink-3">A complete first draft of the specification. You review it, element by element.</span>
								</button>
								<button type="button" aria-pressed={help === 'myself'} onclick={() => (help = 'myself')} class="{CARD} gap-1.5 p-4 {card(help === 'myself')}">
									<span class="text-[0.9375rem] font-bold">Without AI for now</span>
									<span class="text-[0.8125rem] leading-normal text-evo-ink-3">You write it yourself, block by block. Connect your AI whenever you want.</span>
								</button>
							</div>
						</div>
						<div class="flex justify-end">
							<button type="button" aria-disabled={busy} onclick={toPrompt} class="{PRIMARY} {enabled(!busy)}">{byHand ? 'Create my project →' : 'Continue →'}</button>
						</div>
					</div>
				{:else if way && created}
					<div class="flex flex-col gap-4">
						<div class="flex flex-col gap-1.5">
							{#if way === 'scratch'}<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">Start from scratch</span>{/if}
							<h2 class={H2}>Paste this prompt in your LLM</h2>
							<span class="text-[0.9375rem] leading-[1.55] text-evo-ink-3">{intro}</span>
						</div>
						<div class="bg-ink px-[18px] py-4 font-evo-mono text-[0.8125rem] leading-[1.6] break-words text-paper">{prompt}</div>
						<div class="flex flex-wrap items-center justify-end gap-2.5">
							{#if rebuildsSpec(way)}
								<button
									type="button"
									aria-pressed={emailWhenReady}
									aria-label="Email me when it’s ready"
									title={emailWhenReady ? 'Your LLM emails you when the analysis is ready, through its own mail connector. Click to turn it off.' : 'Email me when it’s ready: your LLM emails you through its own mail connector.'}
									onclick={() => (emailWhenReady = !emailWhenReady)}
									class="grid size-11 flex-none cursor-pointer place-items-center border-[1.5px] {emailWhenReady ? 'border-ink bg-ink text-paper' : 'border-line bg-transparent text-ink'}"
								>
									<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>
								</button>
								<LlmConnection {aiSeenAt} {now} class="min-w-0 flex-[1_1_180px]" />
							{/if}
							<button type="button" onclick={copy} class="pressable min-h-11 cursor-pointer border-[1.5px] border-ink bg-transparent px-[18px] text-[0.8125rem] font-bold tracking-[0.07em] text-ink uppercase">{copied ? 'Copied ✓' : 'Copy the prompt'}</button>
							{#if !rebuildsSpec(way)}
								<button type="button" aria-disabled={busy} onclick={() => begin(true)} class="{PRIMARY} {enabled(!busy)}">Open my project →</button>
							{:else if aiSeenAt}
								<button type="button" aria-disabled={busy} onclick={() => begin(true)} class="{PRIMARY} {enabled(!busy)} animate-[lk-in_0.25s_ease_both]">I ran the prompt →</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
			{#if step > 1}
				<button type="button" onclick={back} class="min-h-9 cursor-pointer self-start border-0 bg-transparent p-0 text-[0.8125rem] font-semibold text-blue-ink">← Back</button>
			{/if}
			{/if}
		</div>
	</div>
{/if}
