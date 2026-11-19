<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import { mcpEndpointFor, mcpRegistrationCommands } from '$domain/foundation';
	import { DOC_GROUPS, DOC_TOPICS, START_PATHS, helpEntries, stepOpenedBy, topicInView, topicsMatching, type HelpEntry } from '$ui/docs/doc-topics';
	import { PRICING_URL } from '$domain/licensing';
	import { PLANS } from '$domain/tier';
	import DocSection from '$ui/docs/DocSection.svelte';
	import FirstStepsDialog from '$ui/shell/FirstStepsDialog.svelte';
	import SideIcon from '$ui/shell/SideIcon.svelte';
	import type { SideIconName } from '$ui/shell/side-icons';
	import { openFeedback } from '$ui/shell/feedback.svelte';
	import { firstSteps } from '$ui/shell/first-steps-guide';
	import { firstStepsUrlFor } from '$ui/shell/first-steps';
	import { HELP_LINKS } from '$ui/shell/help-links';
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import type { PageData } from './$types';

	/**
	 * The Documentation (criterion e3629a5f, action a6210dd0): built into the
	 * installation, so it reads with no route out of the machine. It opens in the
	 * app's shell on its name, then Get help (First steps, Guided tour, the
	 * community once its address is known, Leave us feedback), Where to start per
	 * kind of reader, then the topics. A table of contents beside them narrows
	 * them as words are typed (their names and their whole text) and lights the
	 * topic in view while the page scrolls.
	 */
	let { data }: { data: PageData } = $props();

	const steps = $derived(firstSteps({ hasProject: !!data.currentProject, ...data.chrome.progress }, data.currentProject?.id ?? null));
	let stepsOpen = $state(false);

	// Read in the browser only: the guide learns this installation from the fragment, and the MCP address is this origin's.
	const origin = $derived(browser ? location.origin : null);
	const help = $derived(helpEntries({ guideUrl: data.onlineHelp ? firstStepsUrlFor(origin) : null, discord: data.onlineHelp ? HELP_LINKS.discord : null }));
	const HELP_ICON: Record<HelpEntry['key'], SideIconName> = { 'first-steps': 'flag', tour: 'overview', community: 'chat', feedback: 'feedback' };
	const mcpUrl = $derived(origin ? mcpEndpointFor(origin) : 'https://<your-lyriks-address>/mcp');
	const mcp = $derived(mcpRegistrationCommands(mcpUrl));

	function openHelp(entry: HelpEntry) {
		if (entry.key === 'first-steps') stepsOpen = true;
		else if (entry.key === 'feedback') openFeedback();
	}

	// The search reads every word of each topic once the page is drawn, so a reader finds a topic by what it says.
	let query = $state('');
	let texts = $state<Record<string, string>>({});
	const visible = $derived(topicsMatching(DOC_TOPICS, texts, query));
	const shown = $derived(new Set(visible.map((t) => t.id)));
	const groups = $derived(DOC_GROUPS.map((g) => ({ g, topics: visible.filter((t) => t.group === g) })).filter((x) => x.topics.length > 0));

	let current = $state<string | null>(DOC_TOPICS[0].id);
	const READING_LINE = 120;

	onMount(() => {
		const read: Record<string, string> = {};
		for (const el of document.querySelectorAll<HTMLElement>('[data-doc-topic]')) read[el.dataset.docTopic ?? ''] = el.textContent?.replace(/\s+/g, ' ') ?? '';
		texts = read;

		// The page scrolls in the app's one scroller: the topic in view is the last one whose top passed the reading line.
		const scroller = document.getElementById('app-scroll');
		if (!scroller) return;
		const follow = () => {
			const top = scroller.getBoundingClientRect().top;
			const tops = [...document.querySelectorAll<HTMLElement>('[data-doc-topic]')].map((el) => ({ id: el.dataset.docTopic ?? '', top: el.getBoundingClientRect().top - top }));
			current = topicInView(tops, READING_LINE);
		};
		follow();
		scroller.addEventListener('scroll', follow, { passive: true });
		// A link to a topic (#editions) lands on it.
		const hash = location.hash.slice(1);
		if (hash) void tick().then(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }));
		return () => scroller.removeEventListener('scroll', follow);
	});

	function jumpTo(e: MouseEvent, id: string) {
		e.preventDefault();
		document.getElementById(id)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
		history.replaceState(null, '', `#${id}`);
		current = id;
	}

	const KICKER = 'font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase';
</script>

<svelte:head><title>Documentation · Lyriks</title></svelte:head>

<div class="mx-auto box-border flex w-full max-w-[1240px] flex-col px-[26px] pt-[22px] pb-16 max-[760px]:px-4 max-[760px]:pt-4">
	<header class="mb-6 flex flex-col gap-2 border-b-2 border-ink pb-[18px]">
		<span class={KICKER}>Help &amp; support</span>
		<h1 class="m-0 text-[2.125rem] leading-[0.98] font-bold tracking-[-0.025em] text-ink max-[700px]:text-[1.625rem]">Documentation</h1>
		<p class="m-0 max-w-[86ch] text-[0.9375rem] leading-[1.6] text-ink-2">
			How to use Lyriks, whatever your part. Start with Get help or Where to start, or type what you look for in the search beside the topics.
		</p>
	</header>

	<div class="grid items-start gap-7 md:grid-cols-[232px_minmax(0,1fr)]">
		<!-- The table of contents: the search at its head, the topic in view lit with the navigation's blue edge. -->
		<aside class="flex flex-col gap-3 md:sticky md:top-5" aria-label="Contents">
			<label class="relative block">
				<span class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-ink-3"><SideIcon name="search" size={15} /></span>
				<input
					bind:value={query}
					type="search"
					placeholder="Search the documentation"
					aria-label="Search the documentation"
					class="box-border h-10 w-full border-[1.5px] border-ink bg-paper pr-3 pl-8 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
				/>
			</label>
			<!-- On a phone the list would push the topics a screen down: the search alone stays. -->
			<nav class="flex flex-col gap-3 max-md:hidden" aria-label="Topics">
				{#each groups as { g, topics } (g)}
					<div class="flex flex-col">
						<span class="mb-1 {KICKER} text-[0.6875rem]">{g}</span>
						{#each topics as t (t.id)}
							<a
								href="#{t.id}"
								onclick={(e) => jumpTo(e, t.id)}
								aria-current={current === t.id ? 'location' : undefined}
								class="border-l-[3px] py-1.5 pr-2 pl-2.5 text-sm no-underline transition-colors {current === t.id
									? 'border-blue bg-surface-sunken font-semibold text-ink'
									: 'border-transparent text-ink-2 hover:bg-surface-sunken hover:text-ink'}">{t.label}</a
							>
						{/each}
					</div>
				{:else}
					<p class="m-0 text-sm text-ink-3">No topic holds “{query.trim()}”.</p>
				{/each}
			</nav>
		</aside>

		<div class="flex min-w-0 flex-col gap-5">
			{#if shown.has('get-help')}
				<DocSection id="get-help" title="Get help" lead="The ways in, whatever you came for.">
					<div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
						{#each help as entry (entry.key)}
							{#snippet body()}
								<span class="flex items-center justify-between gap-2">
									<span aria-hidden="true" class="flex size-[38px] items-center justify-center border-[1.5px] border-ink bg-paper text-ink"><SideIcon name={HELP_ICON[entry.key]} size={18} /></span>
									{#if entry.href}<span class="text-ink-3" title="Opens in a new tab"><SideIcon name="external" size={14} /></span>{/if}
								</span>
								<span class="text-[0.9375rem] font-bold text-ink">{entry.title}</span>
								<span class="text-[0.8125rem] leading-normal text-ink-2">{entry.line}</span>
							{/snippet}
							{#if entry.href}
								<a href={entry.href} target="_blank" rel="noopener noreferrer" data-help={entry.key} class="pressable flex flex-col gap-2 border-[1.5px] border-ink bg-toner-1 p-4 text-left no-underline">{@render body()}</a>
							{:else}
								<button type="button" data-help={entry.key} onclick={() => openHelp(entry)} class="pressable flex cursor-pointer flex-col gap-2 border-[1.5px] border-ink bg-toner-1 p-4 text-left">{@render body()}</button>
							{/if}
						{/each}
					</div>
					<p>Help &amp; support, at the foot of the navigation, opens the same first steps and the feedback from any page.</p>
				</DocSection>
			{/if}

			{#if shown.has('start')}
				<DocSection id="start" title="Where to start" lead="One short path for each part people play in Lyriks.">
					<!-- Two by two: four paths never leave one alone on its row. -->
					<div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
						{#each START_PATHS as path (path.who)}
							<div class="flex flex-col gap-2.5 border border-line bg-toner-1 p-4">
								<span class="text-[0.9375rem] font-bold text-ink">{path.who}</span>
								<ol class="m-0 flex list-none flex-col gap-1.5 p-0">
									{#each path.steps as step, i (step.text)}
										{@const opener = stepOpenedBy(step, data.edition)}
										<li class="flex gap-2.5 text-[0.8125rem] leading-normal text-ink-2">
											<span aria-hidden="true" class="flex size-5 flex-none items-center justify-center border-[1.5px] border-ink font-evo-mono text-[0.6875rem] font-bold text-ink">{i + 1}</span>
											{#if opener}
												<span>{step.text}: <a href="#editions" onclick={(e) => jumpTo(e, 'editions')}>{opener} opens it</a></span>
											{:else}
												<a href="#{step.topic}" onclick={(e) => jumpTo(e, step.topic)}>{step.text}</a>
											{/if}
										</li>
									{/each}
								</ol>
							</div>
						{/each}
					</div>
				</DocSection>
			{/if}

			{#if shown.has('what')}
				<DocSection id="what" title="What Lyriks is" lead="One specification for the whole product, kept true as the product changes.">
					<p>
						Lyriks holds the specification of a product as one whole: what it does (its features, the actions people take and the rules each action obeys), who uses it, how it looks and
						flows, the data it keeps and what it runs on. The specification is <strong>executable</strong>: every action carries its rules and its scenarios, so Lyriks checks it for gaps
						and contradictions instead of leaving a pile of documents.
					</p>
					<p>
						You rarely write it from a blank page. <strong>Your own AI</strong> (Claude, Codex, Cursor or any client that speaks MCP) reads your code and your documents through the Lyriks MCP
						and writes the specification; people read it, correct it and validate it in <strong>Knowledge</strong>. From then on every change goes to the specification first,
						and Lyriks follows the code against it.
					</p>
					<p>Lyriks runs on your own servers, offline if you want: by default it calls no AI service and nothing on the Internet.</p>
				</DocSection>
			{/if}

			{#if shown.has('editions')}
				<DocSection id="editions" title="Editions" lead="The plans Lyriks is offered in, and the edition a licence key grants.">
					<!-- The offers as the Plans dialog lists them: one source, PLANS, so the two never disagree; what a key changes and what the configuration sets (criterion ac-leaf-313aafc6). -->
					<ul class="rows">
						{#each PLANS as plan (plan.id)}
							<li><span>{plan.name}</span><span>{plan.free ? 'Free. ' : ''}{plan.pitch} {[...plan.includes, ...plan.excludes].join('; ')}.</span></li>
						{/each}
					</ul>
					<p>
						The key is checked on the machine itself: activation never calls home. A licence key grants one of two editions, Community or Enterprise. On an installation that runs
						the Enterprise images, the key in force decides what it opens: an Enterprise key opens Enterprise, a Community key opens Community, and entering a key on the activation
						page is all a switch takes. A Community installation opens a paid plan once whoever runs it installs the Enterprise images; an Enterprise key there opens Community.
						The edition this installation runs reads in <a href="/settings#account">Settings, Account</a>, the Plans entry of the account menu lists the offers, and the prices are on the plans page,
						{#if data.onlineHelp}<a href={PRICING_URL} target="_blank" rel="noopener noreferrer">{PRICING_URL.replace(/^https?:\/\//, '')}</a>{:else}{PRICING_URL.replace(/^https?:\/\//, '')}{/if}.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('projects')}
				<DocSection id="projects" title="Projects and folders" lead="Home, the projects of the installation and how to start a new one.">
					<p>
						<strong>Home</strong> tells you, across every project you can open, what came in since you last read it: one sentence sums it up, its numbers filter the feed, and
						<strong>All projects</strong> narrows it to some projects. The feed groups its cards by level, the most urgent first (critical, drift, missing, your decision, match,
						certified, good to know); a card opens where it happened, and <strong>Got it</strong> or <strong>Later</strong> puts it aside, as in the notifications. A feature whose code
						changed outside Lyriks reads as a drift card that opens Mismatch. At the right, <strong>Running now</strong> shows what Lyriks is doing for you: each Reverse-Specification
						and evolution under way, stopped or waiting on you, with where it stands.
					</p>
					<p>
						The current project is the button under Notifications in the navigation: it opens the projects, filed in their <strong>folders</strong>. <strong>+ Folder</strong> adds a folder,
						its pencil (or a double click on its name) renames it, <strong>+ Project</strong> files a new project in it, and an empty folder can be deleted. A project moves to another
						folder or is deleted from its row; deleting one that holds anything asks you to type its name.
					</p>
					<p>
						Drag a folder by its grip, or press <kbd>Alt</kbd> with <kbd>↑</kbd> or <kbd>↓</kbd> on it, to put the folders in the order your team works in: the order is the same for
						everyone. <strong>No folder</strong>, the projects filed nowhere, stays last; a folder nobody placed yet reads in alphabetical order after the others.
					</p>
					<h3>Starting a project</h3>
					<p>
						<strong>+ New project</strong> asks for its name, then whether the product already exists. An existing product is learned <strong>from a codebase</strong> (recommended: your AI
						reads the repository and Lyriks rebuilds the whole specification), <strong>from anything else</strong> (documents, even outdated) or <strong>manually</strong> (you describe it
						section by section with your AI). A new product starts from a document or from an idea, with your AI block by block, all at once, or without AI for now. Lyriks then hands you the
						prompt to paste in your AI.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('reverse-spec')}
				<DocSection id="reverse-spec" title="Reverse-Specification" lead="Rebuilding the specification of a product that already exists.">
					<p>
						A <strong>Reverse-Specification</strong> rebuilds the specification from the code and the documents of the product. Lyriks hands you a prompt; you paste it in your AI, which
						reads the product through the Lyriks MCP and writes each part of the specification, citing where each element comes from.
					</p>
					<p>
						Its page has two steps, <strong>Source</strong> and <strong>Analysis</strong>. The analysis shows its phases as your AI goes through them (reading the code, product and users,
						features, actions and rules, data model, experience and design, business rules, tech stack, final check), what it found so far and the log of its calls.
					</p>
					<p>
						If your AI stops calling, the analysis reads <strong>paused</strong> and a red alert says since when. Look in your AI's window first: it may be asking you to allow a Lyriks tool.
						If it stopped, copy the prompt from the alert and paste it in your AI session: it resumes where it stopped, without rewriting what is written.
					</p>
					<p>
						Your AI ends with its final check. If it stopped before, <strong>Mark the analysis as finished</strong>, at the foot of the board, closes it. The summary then says what was read,
						how much of the specification was found in the code and how much cites its source, and Knowledge opens for validation.
					</p>
					<p>
						<strong>Reverse</strong>, in the navigation, opens the runs of the product: the last one, then its history (date, source, commit, result). Once the analysis of the last
						run is over, validated or not, <strong>Relaunch the analysis</strong> starts the next one; a last run not validated closes and keeps the validations already given. The next runs are <strong>complementary</strong>, whatever they read: each starts from the specification already
						gathered and erases nothing. It reads only what changed in the code since the last validated run (or, when no commit was recorded, what changed in the code and the
						documents the specification cites), and the edits made by hand, or, if you choose so, the whole product again. Only what it changes goes back to validation.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('spec360')}
				<DocSection id="spec360" title="Knowledge" lead="The whole specification of the project, page by page, as the tabs of Knowledge list it.">
					<ul class="rows">
						<li><span>Overview</span><span>About the product, why it exists (today's situation and the target), what it does, who uses it and what Lyriks noticed, under its figures: Features, Users, Health, Noticed.</span></li>
						<li><span>Features</span><span>The core features and the features inside each. A feature's page shows the path a person goes through, its screens and actions; each action says who may do it and the rules it obeys, written as requirements (When ..., the system shall ...), and the data it keeps.</span></li>
						<li><span>Users</span><span>The profiles who use the product, end users and admins, and the access each one has to each action.</span></li>
						<li><span>Experience</span><span>The journeys people go through, and the design system the screens are drawn with (colors, typography, corners and spacing, shadows and breakpoints) with the reusable components. Your AI reads the same design system through the Lyriks MCP (get_design_system) to build the interface on-brand, and holds a design against it (check_design).</span></li>
						<li><span>Technology &amp; data</span><span>The Data map, the Architecture, the Operations of the running product, the Requirements and the Sources the specification rests on.</span></li>
						<li><span>Glossary</span><span>The words of the product, with the synonyms to avoid.</span></li>
					</ul>
					<h3>Editing</h3>
					<p>
						<strong>Edit</strong>, in the head of a page, or <kbd>Ctrl</kbd> <kbd>E</kbd> (<kbd>⌘</kbd> <kbd>E</kbd> on a Mac), turns every text the page can change into a field.
						<strong>Save</strong> records what you changed and leaves the Edit mode; <strong>Cancel editing</strong> drops it after asking.
					</p>
					<h3>Discussing</h3>
					<p>
						Every block takes comments, its thread at its foot. <strong>Ask my AI</strong>, at the foot of the navigation, is where you ask your AI about the page you read: it answers
						in a thread, and Reply under its answer asks it again. In a drawer or an enlarged diagram, the comments offer <strong>Ask your AI</strong> beside New topic. The book with a count opens the sources a block rests on: the code, a document, a ticket.
					</p>
					<p>
						<strong>New</strong> marks what entered the specification lately (<a href="/settings#display">Settings, Display</a> sets for how many days, 0 turns it off), and what an
						evolution brought stays marked until you open it.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('validation')}
				<DocSection id="validation" title="Validating the specification" lead="Who says the specification is right, and how.">
					<!-- The band counts the page on screen and offers Validate all section, never the whole specification (criteria 71c9c06b, d7cd4e43). -->
					<p>
						A specification written by an AI is a <strong>DRAFT</strong> until people validate it. Each element shows <strong>Validate</strong> with the initials of the people it waits on;
						once they all validated, it reads Validated. A section's <strong>Validate all</strong> validates at once everything in it that waits on you, and the band at the top of Knowledge
						counts what is validated on the page on screen, with <strong>Validate all section</strong> for the elements of the page that wait on you.
					</p>
					<p>
						Under the top bar of Knowledge, a band reads DRAFT · TO VALIDATE until everything is validated, then <strong>VALIDATED</strong>; while it is a draft, a tab whose elements are all
						validated carries a small green check. A validated specification is no longer changed in place: a change to it goes through an evolution, in Changes. In place it still takes a decision on a point Lyriks noticed, an operations target, and cancelling a hand edit made earlier.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('follow-up')}
				<DocSection id="follow-up" title="Follow-up" lead="What happens to the specification once it is written.">
					<ul class="rows">
						<li>
							<span>Changes</span><span>Solo Builder, Team and Enterprise. An evolution carries one change to the product: its need, its solution and its specification, step by step, with your AI if you want. Lyriks shows its impact on the product as it would be; the change is then frozen as a numbered version the code is built and checked against, and written into the specification when it goes live, never before. The board lists the requests in progress, completed and canceled.</span>
						</li>
						<li>
							<span>Mismatch</span><span>Once the specification is validated: the changes in the code that wait for a decision, each kept until a Reverse-Specification reads the code, and the hand edits a validated specification took before editing it in place was put on hold. The navigation counts what waits. While a later Reverse-Specification is not validated, it holds that run's report.</span>
						</li>
						<li>
							<span>Health</span><span>The score of the project, then every point that weighs on it, by type, the heaviest first: a contradiction, a gap, an open question. Each says where to fix it; tick points to open a New evolution with them, or reject one that is not a problem.</span>
						</li>
					</ul>
				</DocSection>
			{/if}

			{#if shown.has('ai')}
				<DocSection id="ai" title="Working with your AI" lead="Lyriks writes nothing with an AI of its own: your AI does, through the Lyriks MCP.">
					<h3>Connecting a client</h3>
					<p>This installation serves its MCP at <code>{mcpUrl}</code>. Register it once in your client:</p>
					<ul class="rows">
						<li><span>Claude Code</span><code>{mcp.claudeCode}</code></li>
						<li><span>Codex</span><code>{mcp.codex}</code></li>
						<li><span>Other clients</span><span>Claude Desktop and Cowork, Cursor and the others add the same address as a remote MCP server.</span></li>
					</ul>
					<p>
						The first call opens the Lyriks sign-in in your browser; a client that cannot open it shows a code to paste by hand. Your client then asks you to allow each Lyriks tool:
						allow them for the whole task (or always), or your AI stops at each one and Lyriks only sees it go quiet.
					</p>
					<h3>Your AI in session</h3>
					<p>
						Without a session, <strong>Ask my AI</strong>, at the foot of the navigation, copies the prompt that opens one, and your question waits for it. Your AI then waits for your clicks on any page of the project
						(Ask my AI, Reply in a conversation it answered in, Re-read the code with my AI on a feature read from the code) and answers each where it was made; the chip at the right of the top bar says what it does, and
						<strong>End the session</strong> stops it. In a repository bound to the project, your AI opens the session by itself.
					</p>
					<p>
						Once the session ended or your AI is gone, the chip leaves the top bar: your next question with Ask my AI copies the prompt again. <strong>Check your AI</strong> means it
						went quiet: look in its window, it may be asking you to allow a tool.
					</p>
					<h3>What the AI may do</h3>
					<p>
						<a href="/settings#ai">Settings, AI suggestions</a> authorizes or blocks what an AI may suggest into the projects, for the whole workspace.
						<a href="/settings#assistant">Settings, AI assistant</a> is Lyriks' own assistant, off until an administrator gives it a key: it draws diagrams from the server.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('measures')}
				<DocSection id="measures" title="Health and the other measures" lead="What the figures of the Overview say, and what they leave out.">
					<ul class="rows">
						<li><span>Features</span><span>How many features the product has, in how many core features.</span></li>
						<li><span>Users</span><span>How many profiles use it, end users and admins.</span></li>
						<li><span>Health</span><span>One score out of 100 with its word (Strong, To watch, Critical), computed from every point listed in Health: the coherence of the specification, what the completeness audit flags and, once code is linked, what the code says about it. A defect of the product weighs most, then a gap in the description, then an open question; what Lyriks could not check counts nothing. Pointing at the figure says what it weighs now.</span></li>
						<li><span>Noticed</span><span>The points still waiting, major and minor. Every one of them is listed in Health.</span></li>
						<li><span>In the code</span><span>After a Reverse-Specification, its summary says how much of the specification was found in the code and how much cites its source.</span></li>
					</ul>
					<p>Read them together: a high health on a specification nobody validated yet still waits for people.</p>
				</DocSection>
			{/if}

			{#if shown.has('team')}
				<DocSection id="team" title="Team, roles and jobs" lead="Enterprise: who may do what in the workspace.">
					<p>
						<a href="/settings#members">Settings, Members</a> invites people. Lyriks sends no email: you copy the accept link and share it. Each member holds a role:
					</p>
					<ul class="rows">
						<li><span>Owner</span><span>Founded the workspace; cannot be demoted or removed.</span></li>
						<li><span>Admin</span><span>Manages the members and every project.</span></li>
						<li><span>Designer</span><span>Edits the projects granted: all of them, or a selection changed at any time.</span></li>
						<li><span>Viewer</span><span>Reads the projects granted.</span></li>
					</ul>
					<p>
						A <strong>job</strong> (product, design, development, QA, security... the list is the workspace's own) says what each person does; an admin sets it in Settings, Members. A
						job grants nothing: it helps name who validates what.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('search')}
				<DocSection id="search" title="Search" lead="Everything of the project, a few letters away.">
					<p>
						<strong>Search</strong> in the navigation, or <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd> on a Mac) from anywhere, opens it beside the navigation. Empty, it lists
						what you opened lately, what was recently added or changed in the project, and the actions (New evolution, New project).
					</p>
					<p>
						Typed, it finds the pages, core features, features, profiles, journeys, glossary terms and evolutions of the project, and the <strong>rules</strong> by any part of their
						sentence, then the other projects. <kbd>↑</kbd> <kbd>↓</kbd> move, <kbd>Enter</kbd> opens, <kbd>Esc</kbd> closes.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('deployment')}
				<DocSection id="deployment" title="Deployment and air-gap" lead="What runs, and what never leaves your network.">
					<ul class="rows">
						<li><span>Platform</span><span>This application, on PostgreSQL, with its realtime relay.</span></li>
						<li><span>MCP gateway</span><span>The entry of AI clients, served on the application's address at /mcp.</span></li>
						<li><span>Behavior engine</span><span>The engine that runs the rules and scenarios, and its editor at /behavior.</span></li>
						<li><span>Enterprise services</span><span>The companion API (workspaces, members, invitations) and the formal engine; the platform runs on its own without them.</span></li>
					</ul>
					<p>
						There is <strong>no runtime egress</strong>: no CDN, web font, telemetry or remote API by default, icons included. The update check, online feedback and the links outside stay shut until an administrator allows them, right after the first password or at any time in <a href="/settings#configuration">Settings, Configuration</a>. The licence is a signed key, pasted once at
						<a href="/activate">/activate</a> and verified on the machine. <a href="/settings#versions">Settings, Versions</a> says what runs. Install, update and security procedures
						come with the appliance, in its deployment dossier.
					</p>
				</DocSection>
			{/if}

			{#if shown.has('shortcuts')}
				<DocSection id="shortcuts" title="Keyboard shortcuts" lead="On a Mac, ⌘ stands for Ctrl.">
					<ul class="rows">
						<li><span><kbd>Ctrl</kbd> <kbd>K</kbd></span><span>Open the search, from anywhere.</span></li>
						<li><span><kbd>[</kbd></span><span>Fold or unfold the navigation, outside a text field.</span></li>
						<li><span><kbd>Ctrl</kbd> <kbd>E</kbd></span><span>Turn the Edit mode on or off, on a page of Knowledge.</span></li>
						<li><span><kbd>Esc</kbd></span><span>Close the open panel, menu or dialog; put back a folder being dragged.</span></li>
						<li><span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></span><span>Move through the search results and open one.</span></li>
						<li><span><kbd>Alt</kbd> <kbd>↑</kbd> <kbd>↓</kbd></span><span>Move a folder up or down, its grip focused.</span></li>
						<li><span><kbd>Ctrl</kbd> <kbd>Enter</kbd></span><span>Send the change you request during a review.</span></li>
					</ul>
				</DocSection>
			{/if}

			{#if shown.has('troubleshooting')}
				<DocSection id="troubleshooting" title="Troubleshooting" lead="The questions people ask most.">
					<ul class="rows">
						<li><span>The analysis reads paused</span><span>Your AI made no call for a while. Look in its window: it may be waiting for you to allow a Lyriks tool. If it stopped, copy the prompt from the alert and paste it in that conversation.</span></li>
						<li><span>My AI asks to allow every tool</span><span>Allow the Lyriks tools for the whole task, or always: a first Reverse-Specification calls dozens of them.</span></li>
						<li><span>My client does not connect</span><span>Check that its address ends with /mcp and is this installation's. A client that cannot open the browser sign-in shows a code to paste by hand.</span></li>
						<li><span>I cannot edit a page</span><span>Edit shows to who may edit the project: a viewer reads only. In Community, only the active project opens.</span></li>
						<li><span>The health is low</span><span>Open Health: each point says what is wrong and where to fix it, the heaviest first.</span></li>
						<li><span>Where is the Control Center?</span><span>It is gone: everything it listed is in Health.</span></li>
						<li><span>Does anything leave my network?</span><span>No, unless you click a link that opens outside (the guided tour, the community) or an administrator gives the AI assistant a key.</span></li>
					</ul>
					<p>Not here? <button type="button" class="cursor-pointer border-0 bg-transparent p-0 text-[0.9375rem] font-semibold text-blue-ink hover:underline" onclick={openFeedback}>Leave us feedback</button>: we read every note.</p>
				</DocSection>
			{/if}

			{#if shown.has('words')}
				<DocSection id="words" title="Words of Lyriks" lead="The words the app uses, each with one meaning.">
					<ul class="rows">
						<li><span>Reverse-Specification</span><span>The rebuilding of a product's specification from what already exists, by your AI.</span></li>
						<li><span>Knowledge</span><span>The whole specification of a project, page by page, where people read and validate it.</span></li>
						<li><span>Core feature</span><span>A large area of the product, grouping its features.</span></li>
						<li><span>Feature</span><span>What the product lets someone do, with its screens and actions.</span></li>
						<li><span>Action</span><span>One thing a person or the system does, always governed by rules.</span></li>
						<li><span>Rule</span><span>A requirement an action obeys: when it is allowed, refused, what it changes.</span></li>
						<li><span>Journey</span><span>The path a profile goes through to reach a goal.</span></li>
						<li><span>Profile</span><span>A kind of user of the product, end user or admin.</span></li>
						<li><span>Draft, Validated</span><span>A specification waiting for people, and one they all approved.</span></li>
						<li><span>Evolution</span><span>A request that carries one change, specified before it is built.</span></li>
						<li><span>Mismatch</span><span>What moved between the code and the validated specification.</span></li>
						<li><span>Health</span><span>The score of the project and the points that weigh on it.</span></li>
						<li><span>MCP</span><span>The protocol your AI uses to read and write in Lyriks.</span></li>
						<li><span>AI session</span><span>Your AI waiting for your clicks on the project, until the session ends.</span></li>
						<li><span>Source</span><span>What an element rests on: code, a document, a ticket.</span></li>
					</ul>
				</DocSection>
			{/if}

			{#if visible.length === 0}
				<div class="border border-line bg-paper p-8 text-center text-sm text-ink-3">Nothing in the documentation holds “{query.trim()}”.</div>
			{/if}
		</div>
	</div>
</div>

{#if stepsOpen}
	<FirstStepsDialog {steps} onClose={() => (stepsOpen = false)} />
{/if}
