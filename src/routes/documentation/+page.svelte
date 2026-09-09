<script lang="ts">
	import { Icon, Logo, type IconName } from '$ui/design-system';

	// Air-gapped appliance docs: bundled with the install, no public site. The page
	// is its own scroll container (the app shell is overflow-hidden) and offers a
	// sticky table of contents + a filter, mirroring Settings.
	type Topic = { id: string; label: string; icon: IconName; keywords: string };
	const TOPICS: Topic[] = [
		{ id: 'overview', label: 'Overview', icon: 'book', keywords: 'what is lyriks spec specification coherence appliance air-gap on-prem' },
		{ id: 'editions', label: 'Editions', icon: 'layers', keywords: 'community enterprise edition tier plan features licence' },
		{ id: 'portfolio', label: 'Portfolio & domains', icon: 'grid', keywords: 'portfolio domains projects create greenfield reverse engineering home' },
		{ id: 'workspace', label: 'The project workspace', icon: 'list', keywords: 'wizard capabilities foundation brief business market features experience rules data functional glossary sidebar sections' },
		{ id: 'coherence', label: 'Project health', icon: 'gauge', keywords: 'readiness coherence maturity control center scores breaches incoherence' },
		{ id: 'experience', label: 'Experience & simulator', icon: 'play', keywords: 'experience builder screens journeys components simulator run demo' },
		{ id: 'team', label: 'Team & roles', icon: 'users', keywords: 'team members roles owner admin designer viewer invitations domain scope enterprise' },
		{ id: 'ai', label: 'AI suggestions', icon: 'sparkles', keywords: 'ai suggestions llm lyriks mcp authorize block switch' },
		{ id: 'mcp', label: 'MCP authoring', icon: 'server', keywords: 'mcp model context protocol author programmatic tools automation' },
		{ id: 'deployment', label: 'Deployment & air-gap', icon: 'shield', keywords: 'deployment air-gap egress offline licence activation postgres back dpo components install' },
		{ id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'bolt', keywords: 'keyboard shortcuts search control center cmd ctrl k j' }
	];

	let query = $state('');
	function topicMatches(t: Topic): boolean {
		const q = query.trim().toLowerCase();
		if (!q) return true;
		return `${t.label} ${t.keywords}`.toLowerCase().includes(q);
	}
	const visibleTopics = $derived(TOPICS.filter(topicMatches));
	const shown = $derived(new Set(visibleTopics.map((t) => t.id)));

	function jumpTo(e: MouseEvent, id: string) {
		e.preventDefault();
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		history.replaceState(null, '', `#${id}`);
	}

	// Capabilities grouped exactly like the project sidebar (Specify / Validate /
	// Govern) so the docs never describe a navigation that doesn't exist. Folded
	// tabs (Behavior, Rules, Reuse) are mentioned inside their host capability.
	const CAPABILITY_GROUPS: { group: string; items: { name: string; blurb: string }[] }[] = [
		{
			group: 'Specify',
			items: [
				{ name: 'Foundation', blurb: 'Brief, business, market, tech, security & ops in one place.' },
				{ name: 'Users & Permissions', blurb: 'Personas and the access matrix (who can do what).' },
				{
					name: 'Features',
					blurb: 'The feature tree, roadmap and work queue, with Behavior, Rules & edge cases and the Reuse library folded in as tabs.'
				},
				{ name: 'Experience', blurb: 'Journeys, screens and a live, runnable demo.' },
				{ name: 'Data & Architecture', blurb: 'Hosts, databases, entities and the stack.' },
				{ name: 'Glossary', blurb: 'Canonical terms and synonyms.' }
			]
		},
		{
			group: 'Validate',
			items: [
				{ name: 'Knowledge graph', blurb: 'The whole project as one graph.' },
				{
					name: 'Control Center',
					blurb: 'Coverage, coherence, build readiness and behavior maturity in one cockpit. Opens from the sidebar score card.'
				}
			]
		},
		{
			group: 'Govern',
			items: [
				{
					name: 'Documents & Traceability',
					blurb: 'Evidence sources and requirement links, in the header "Project tools" menu.'
				}
			]
		}
	];
</script>

<svelte:head><title>Documentation · Lyriks</title></svelte:head>

<div class="min-h-0 flex-1 overflow-y-auto">
	<!-- Hero -->
	<header class="gradient-violet text-white">
		<div class="mx-auto max-w-5xl px-6 py-8">
			<a href="/" class="inline-flex items-center gap-1.5 text-xs font-medium text-white/70 transition hover:text-white">
				<Icon name="arrow-left" size={14} /> Back to projects
			</a>
			<div class="mt-4 flex items-center gap-3">
				<Logo size={30} />
				<div>
					<h1 class="text-2xl font-bold tracking-tight">Documentation</h1>
					<p class="text-sm text-white/70">How Lyriks turns product intent into a coherent, buildable specification.</p>
				</div>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-5xl px-6 py-8">
		<div class="grid gap-8 md:grid-cols-[204px_1fr]">
			<!-- TOC rail: filter + jump links, sticky on desktop. -->
			<aside class="space-y-3 md:sticky md:top-6 md:self-start">
				<div class="relative">
					<span class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-ink-400">
						<Icon name="search" size={14} />
					</span>
					<input
						bind:value={query}
						type="search"
						placeholder="Search docs…"
						aria-label="Search documentation"
						class="w-full rounded-pill border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-ink-900 outline-none focus:border-brand-300"
					/>
				</div>
				<nav class="flex flex-col gap-0.5">
					{#each visibleTopics as t (t.id)}
						<a
							href="#{t.id}"
							onclick={(e) => jumpTo(e, t.id)}
							class="flex items-center gap-2 rounded-field px-2.5 py-1.5 text-sm font-medium text-ink-600 transition hover:bg-surface-sunken hover:text-ink-900"
						>
							<Icon name={t.icon} size={14} />
							{t.label}
						</a>
					{:else}
						<p class="px-2.5 py-1.5 text-xs text-ink-400">No topic matches.</p>
					{/each}
				</nav>
			</aside>

			<!-- Content -->
			<div class="min-w-0 space-y-5">
				{#if shown.has('overview')}
					<section id="overview" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="book" size={17} class="text-brand-500" /> Overview
						</h2>
						<p class="text-sm leading-relaxed text-ink-600">
							Lyriks is a self-hosted platform for authoring a product's specification as
							<strong>executable behavior</strong>, and keeping that specification coherent as it
							grows. You describe the product once (foundation, users, features, experience, rules,
							data), and Lyriks continuously checks it for gaps and contradictions, so what you hand
							to a team (or an AI) is buildable, not just a pile of docs.
						</p>
						<p class="text-sm leading-relaxed text-ink-600">
							It runs <strong>on-prem and air-gapped</strong> with zero runtime egress. The platform
							works standalone on PostgreSQL with a local coherence engine and a built-in AI stub
							(the <em>Minimal Autonomous Product</em>), and layers in richer AI, formal verification
							and multi-member collaboration when you enable them.
						</p>
					</section>
				{/if}

				{#if shown.has('editions')}
					<section id="editions" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="layers" size={17} class="text-brand-500" /> Editions
						</h2>
						<p class="text-sm text-ink-600">Three editions on the same PostgreSQL foundation, so upgrading never needs a data migration.</p>
						<div class="overflow-x-auto">
							<table class="w-full min-w-[34rem] border-collapse text-sm">
								<thead>
									<tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-400">
										<th class="py-2 pr-3 font-semibold">Edition</th>
										<th class="py-2 pr-3 font-semibold">For</th>
										<th class="py-2 font-semibold">Adds</th>
									</tr>
								</thead>
								<tbody class="text-ink-700">
									<tr class="border-b border-line/70">
										<td class="py-2 pr-3 font-semibold text-ink-900">Community</td>
										<td class="py-2 pr-3">A single trusted operator</td>
										<td class="py-2">Spec authoring + local & behavior coherence. Free, with a perpetual key requested at get.lyriks.io and pasted once at <code>/activate</code>.</td>
									</tr>
									<tr>
										<td class="py-2 pr-3 font-semibold text-ink-900">Enterprise</td>
										<td class="py-2 pr-3">A team</td>
										<td class="py-2">+ multi-member workspaces, Team & roles, SSO/invitations and formal DPO coherence.</td>
									</tr>
								</tbody>
							</table>
						</div>
						<p class="text-xs text-ink-500">Your current edition is shown in <a href="/settings#account" class="font-medium text-brand-600 hover:underline">Settings → Account</a>.</p>
					</section>
				{/if}

				{#if shown.has('portfolio')}
					<section id="portfolio" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="grid" size={17} class="text-brand-500" /> Portfolio & domains
						</h2>
						<p class="text-sm leading-relaxed text-ink-600">
							The home screen is your <strong>portfolio</strong>. Projects are grouped into
							<strong>domains</strong> (Sales, Product, Platform…) that you create and rename from the
							left rail. Each project card shows its delivery stage (read from the spec itself, up to
							<strong>MVP in progress</strong>; only a human marks a product <strong>shipped</strong>,
							from the card menu), plus its readiness, coherence and production scores at a glance.
						</p>
						<p class="text-sm leading-relaxed text-ink-600">
							Create a project greenfield, or reverse-engineer an existing one via code-to-spec. Use
							the search in the top bar (<kbd class="rounded border border-line bg-surface-sunken px-1 text-[11px]">⌘/Ctrl-K</kbd>)
							to jump to any project or component.
						</p>
					</section>
				{/if}

				{#if shown.has('workspace')}
					<section id="workspace" class="scroll-mt-6 space-y-4 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="list" size={17} class="text-brand-500" /> The project workspace
						</h2>
						<p class="text-sm leading-relaxed text-ink-600">
							Inside a project, the left sidebar is a set of <strong>capabilities</strong> you can visit
							in any order; there's no forced wizard. Each one owns a slice of the specification and
							validates its own input at the edge.
						</p>
						{#each CAPABILITY_GROUPS as g (g.group)}
							<div>
								<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{g.group}</p>
								<ul class="divide-y divide-line rounded-field border border-line">
									{#each g.items as it (it.name)}
										<li class="flex items-start gap-3 px-3 py-2 text-sm">
											<Icon name="chevron-right" size={14} class="mt-0.5 shrink-0 text-brand-400" />
											<span><span class="font-semibold text-ink-900">{it.name}:</span> <span class="text-ink-600">{it.blurb}</span></span>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</section>
				{/if}

				{#if shown.has('coherence')}
					<section id="coherence" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="gauge" size={17} class="text-brand-500" /> Project health
						</h2>
						<p class="text-sm leading-relaxed text-ink-600">
							Lyriks keeps four signals distinct. <strong>Coverage</strong> is structural breadth;
							<strong>Behavior Maturity</strong> is authored behavior depth in five named stages
							(Idea to Complete);
							<strong>Build Readiness</strong> combines both into the implementation gate; and
							<strong>Coherence</strong> measures whether the parts agree without contradictions,
							dangling references or unmet rules.
						</p>
						<p class="text-sm leading-relaxed text-ink-600">
							The Build Readiness card at the foot of the project sidebar opens the
							<strong>Control Center</strong>, where breaches and incoherences are listed with the
							next best action for each. Open it anywhere with
							<kbd class="rounded border border-line bg-surface-sunken px-1 text-[11px]">⌘/Ctrl-J</kbd>.
						</p>
					</section>
				{/if}

				{#if shown.has('experience')}
					<section id="experience" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="play" size={17} class="text-brand-500" /> Experience & simulator
						</h2>
						<p class="text-sm leading-relaxed text-ink-600">
							The Experience capability is a visual builder for the product's journeys and screens,
							assembled from reusable components with a shared brand. It doubles as a
							<strong>runnable prototype</strong>: switch to run mode to click through the flows, with
							screen areas gated per persona from the permissions matrix.
						</p>
						<p class="text-sm leading-relaxed text-ink-600">
							Coverage tooling tells you which journeys and screens are still unreached, so the demo
							and the spec stay in step.
						</p>
					</section>
				{/if}

				{#if shown.has('team')}
					<section id="team" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="users" size={17} class="text-brand-500" /> Team & roles
						</h2>
						<p class="text-sm text-ink-600">Multi-member collaboration is an Enterprise capability. Roles:</p>
						<ul class="divide-y divide-line rounded-field border border-line text-sm">
							<li class="flex gap-3 px-3 py-2"><span class="w-20 shrink-0 font-semibold text-ink-900">Owner</span><span class="text-ink-600">The workspace's founder; cannot be demoted or removed.</span></li>
							<li class="flex gap-3 px-3 py-2"><span class="w-20 shrink-0 font-semibold text-ink-900">Admin</span><span class="text-ink-600">Manages members and every project.</span></li>
							<li class="flex gap-3 px-3 py-2"><span class="w-20 shrink-0 font-semibold text-ink-900">Designer</span><span class="text-ink-600">Edits the projects they're granted, scoped by domain.</span></li>
							<li class="flex gap-3 px-3 py-2"><span class="w-20 shrink-0 font-semibold text-ink-900">Viewer</span><span class="text-ink-600">Read-only access to the projects they're granted.</span></li>
						</ul>
						<p class="text-sm leading-relaxed text-ink-600">
							Invite everyone from <a href="/settings#members" class="font-medium text-brand-600 hover:underline">Settings → Members</a>:
							admins see every project; designers and viewers get all projects or a selection, which
							you can change at any time, while the invitation is still pending too. Air-gapped by
							design: no email is sent. You copy an accept link and share it.
						</p>
					</section>
				{/if}

				{#if shown.has('ai')}
					<section id="ai" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="sparkles" size={17} class="text-brand-500" /> AI suggestions
						</h2>
						<p class="text-sm leading-relaxed text-ink-600">
							AI suggestions are <strong>opt-in and blocked by default</strong>, and Lyriks never calls
							an AI service itself: no keys, no outbound traffic. Suggestions have exactly one
							source: your own LLM (Claude, or any MCP client) working through the Lyriks MCP tools,
							outside the app. The switch in
							<a href="/settings#ai" class="font-medium text-brand-600 hover:underline">Settings → AI suggestions</a>
							authorizes or blocks that generation for the whole workspace. When blocked, MCP
							suggestion writes are rejected and nothing is shown in the wizard.
						</p>
					</section>
				{/if}

				{#if shown.has('mcp')}
					<section id="mcp" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="server" size={17} class="text-brand-500" /> MCP authoring
						</h2>
						<p class="text-sm leading-relaxed text-ink-600">
							Everything you can do in the UI, you can do programmatically through the Lyriks
							<strong>MCP</strong> (Model Context Protocol) server: create projects, author each
							specification section, build screens and drive the simulator, then verify coverage. It's
							the same bounded API the app uses, so agent-authored changes stay coherent.
						</p>
						<p class="text-sm leading-relaxed text-ink-600">
							The MCP gateway runs as its own service beside the platform and is served on your
							install's origin at <code>/mcp</code>; point your MCP client at it to start authoring.
						</p>
					</section>
				{/if}

				{#if shown.has('deployment')}
					<section id="deployment" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="shield" size={17} class="text-brand-500" /> Deployment & air-gap
						</h2>
						<p class="text-sm text-ink-600">The appliance is the platform, the MCP gateway and the behaviour dashboard on PostgreSQL. Enterprise adds two components; the platform runs on its own if they are absent.</p>
						<ul class="divide-y divide-line rounded-field border border-line text-sm">
							<li class="flex gap-3 px-3 py-2"><span class="w-32 shrink-0 font-semibold text-ink-900">lyriks-platform</span><span class="text-ink-600">This app: SvelteKit / Node / PostgreSQL, with the realtime relay.</span></li>
							<li class="flex gap-3 px-3 py-2"><span class="w-32 shrink-0 font-semibold text-ink-900">MCP gateway</span><span class="text-ink-600">The entry point of AI clients, served on the app origin at /mcp.</span></li>
							<li class="flex gap-3 px-3 py-2"><span class="w-32 shrink-0 font-semibold text-ink-900">Dashboard</span><span class="text-ink-600">The unspaghettit behaviour editor, served at /behavior.</span></li>
							<li class="flex gap-3 px-3 py-2"><span class="w-32 shrink-0 font-semibold text-ink-900">lyriks-back</span><span class="text-ink-600">Enterprise: the companion API (workspaces, members, invitations).</span></li>
							<li class="flex gap-3 px-3 py-2"><span class="w-32 shrink-0 font-semibold text-ink-900">lyriks-dpo</span><span class="text-ink-600">Enterprise: the formal engine (Rust) with its own PostgreSQL.</span></li>
						</ul>
						<p class="text-sm leading-relaxed text-ink-600">
							There is <strong>zero runtime egress</strong> to the public Internet: no CDNs, web fonts,
							telemetry or remote APIs by default. Icons are bundled offline. Product activation uses a
							signed licence key verified locally against a bundled public key, with no network required.
						</p>
						<p class="text-xs text-ink-500">Install, upgrade and security procedures live in the deployment dossier bundled with your appliance under <code class="font-mono">docs/deployment/</code>.</p>
					</section>
				{/if}

				{#if shown.has('shortcuts')}
					<section id="shortcuts" class="scroll-mt-6 space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
						<h2 class="flex items-center gap-2 text-base font-bold text-ink-900">
							<Icon name="bolt" size={17} class="text-brand-500" /> Keyboard shortcuts
						</h2>
						<ul class="divide-y divide-line rounded-field border border-line text-sm">
							<li class="flex items-center gap-3 px-3 py-2">
								<kbd class="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold">⌘/Ctrl-K</kbd>
								<span class="text-ink-600">Search projects & components (portfolio), or everything in the current project.</span>
							</li>
							<li class="flex items-center gap-3 px-3 py-2">
								<kbd class="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold">⌘/Ctrl-J</kbd>
								<span class="text-ink-600">Open the project Control Center.</span>
							</li>
							<li class="flex items-center gap-3 px-3 py-2">
								<kbd class="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold">Esc</kbd>
								<span class="text-ink-600">Close the open menu, dialog or panel.</span>
							</li>
						</ul>
					</section>
				{/if}

				{#if visibleTopics.length === 0}
					<div class="rounded-card border border-line bg-surface p-8 text-center text-sm text-ink-400">
						No documentation matches “{query}”.
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
