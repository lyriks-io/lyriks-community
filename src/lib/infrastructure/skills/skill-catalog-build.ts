import type {
	BindingHookInstall,
	BindingInstallTarget,
	BindingToolInstall,
	InstalledSkillRef,
	InstalledToolRef,
	Skill,
	SkillBinding,
	SkillClientId,
	SkillInstallTarget,
	SkillSyncEntry,
	SkillSyncOptions,
	SkillSyncResult
} from '$application/ports';

/**
 * Pure catalog construction and sync logic for the bundled skill files: parse
 * the YAML frontmatter of each SKILL.md, keep only the allowlisted authoring
 * skills, derive the summary metadata (size, content hash), stamp the install
 * variant, compute the per-runtime install layouts, and diff a client's
 * installed set against the catalog. Kept free of any Vite/glob machinery so
 * it is unit-testable — the server adapter feeds it the raw files.
 */

/** Only these skills are published; everything else (e.g. graphify) is repo-internal. */
export const PUBLISHED_SKILL_IDS = [
	'lyriks-build',
	'lyriks-design',
	'lyriks-behavior',
	'lyriks-retrospec',
	'lyriks-delivery',
	'lyriks-evolution'
] as const;

/**
 * The most a published guide may weigh once serialized as a JSON string (its
 * escapes counted). The MCP gateway keeps every skill answer under 45,000
 * characters, because Claude Code takes an MCP answer without counting its
 * tokens only up to 50,000 and refused a 59,056-character one; a guide must be
 * able to travel alone in one get_skill answer, with its install layout beside
 * it. A guide past this is split into two guides, never sent in pieces: an
 * install writes it verbatim (criterion 526377e2).
 */
export const GUIDE_MAX_SERIALIZED_CHARS = 42_000;

/**
 * The most characters one published playbook may hold. Every client reads a
 * loaded playbook whole, at every session, so its length is paid each time:
 * a rule is said once, in chosen words, and a new sentence is paid for by a
 * cut. Measured on the rewritten playbooks, whose largest holds 19,993
 * characters (criterion 5d8e23b4).
 */
export const PLAYBOOK_MAX_CHARS = 20_000;

/**
 * Vendor-neutral home for the skill body. Claude Code discovers its own
 * layout; every other runtime reads this path through a pointer in the
 * instruction file it already loads.
 */
export function portableInstallPath(id: string): string {
	return `.agents/skills/${id}/SKILL.md`;
}

/** Claude Code's native skill layout. */
export function skillInstallPath(id: string): string {
	return `.claude/skills/${id}/SKILL.md`;
}

/** Delimiters that make a pointer merge idempotent and scoped to one skill. */
export function pointerMarkers(id: string): { open: string; close: string } {
	return { open: `<!-- lyriks-skill:${id} -->`, close: `<!-- /lyriks-skill:${id} -->` };
}

/**
 * The block merged into a client's instruction file. Replace whatever sits
 * between the markers, or append the whole block when they are absent; never
 * rewrite the rest of the file, which belongs to the user.
 */
export function buildPointerBlock(id: string, name: string, description: string): string {
	const { open, close } = pointerMarkers(id);
	return [
		open,
		`## ${name}`,
		'',
		description,
		'',
		`Before authoring Lyriks project data through the Lyriks MCP tools, read \`${portableInstallPath(id)}\` in full and follow it. It is the authoritative procedure — do not improvise around it.`,
		close
	].join('\n');
}

/**
 * Where each supported runtime expects to find guidance. `pointerPath` is the
 * file the runtime already reads on its own; leaving it out means the runtime
 * discovers `path` natively and writing the file is the whole install.
 */
const CLIENT_LAYOUTS: ReadonlyArray<{
	client: SkillClientId;
	label: string;
	path: (id: string) => string;
	pointerPath?: string;
}> = [
	{ client: 'claude', label: 'Claude Code / Claude Desktop', path: skillInstallPath },
	{ client: 'codex', label: 'OpenAI Codex', path: portableInstallPath, pointerPath: 'AGENTS.md' },
	{ client: 'gemini', label: 'Gemini CLI', path: portableInstallPath, pointerPath: 'GEMINI.md' },
	{
		client: 'copilot',
		label: 'GitHub Copilot',
		path: portableInstallPath,
		pointerPath: '.github/copilot-instructions.md'
	},
	{
		client: 'generic',
		label: 'Any other agent',
		path: portableInstallPath,
		pointerPath: 'AGENTS.md'
	}
];

/** The install layouts for one skill, one entry per supported runtime. */
export function buildInstallTargets(
	id: string,
	name: string,
	description: string
): SkillInstallTarget[] {
	const pointerBlock = buildPointerBlock(id, name, description);
	return CLIENT_LAYOUTS.map((layout) => {
		const target: SkillInstallTarget = {
			client: layout.client,
			label: layout.label,
			path: layout.path(id)
		};
		if (layout.pointerPath) {
			target.pointerPath = layout.pointerPath;
			target.pointerBlock = pointerBlock;
		}
		return target;
	});
}

/**
 * Tiny frontmatter parser — just enough for our SKILL.md headers: a `---`
 * fenced block of `key: value` lines, values optionally double-quoted. Not a
 * YAML engine on purpose (no new dependency; nested YAML is out of scope).
 */
export function parseFrontmatter(raw: string): Record<string, string> {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
	if (!match) return {};
	const fields: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const sep = line.indexOf(':');
		if (sep <= 0) continue;
		const key = line.slice(0, sep).trim();
		let value = line.slice(sep + 1).trim();
		if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
			value = value.slice(1, -1).replace(/\\"/g, '"');
		}
		if (key) fields[key] = value;
	}
	return fields;
}

/** FNV-1a 32-bit over UTF-16 code units — a cheap, stable content fingerprint. */
export function fnv1aHash(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * The install variant: the original file with a `contentHash: <hash>` line
 * injected just before the closing frontmatter fence — everything else stays
 * byte-identical. The installed copy thus self-reports its version: an agent
 * reads that one line instead of hashing anything. A file without frontmatter
 * (not our case, but tolerated) gets a minimal header prepended.
 */
export function injectContentHash(raw: string, hash: string): string {
	const fence = /^---\r?\n[\s\S]*?\r?\n(---)/.exec(raw);
	if (!fence) return `---\ncontentHash: ${hash}\n---\n${raw}`;
	const closingStart = fence.index + fence[0].length - fence[1].length;
	return `${raw.slice(0, closingStart)}contentHash: ${hash}\n${raw.slice(closingStart)}`;
}

/**
 * The install variant of a script (a helper or the hook): the original with a
 * `// contentHash: <hash>` comment as its first line, or its second when the
 * first is a shebang (which must stay first to work). Like the SKILL.md line,
 * it lets a client report what it holds by reading one line, never by hashing.
 */
export function injectScriptHash(raw: string, hash: string): string {
	const line = `// contentHash: ${hash}\n`;
	if (!raw.startsWith('#!')) return line + raw;
	const end = raw.indexOf('\n');
	return end < 0 ? `${raw}\n${line}` : raw.slice(0, end + 1) + line + raw.slice(end + 1);
}

/**
 * One binding file for a client: the install variant, unless the client
 * reported holding this very hash at `path`, in which case the content stays
 * home. That is what keeps a routine sync small: the scripts weigh tens of
 * kilobytes and rarely change.
 */
function installOrSkip(
	path: string,
	raw: string,
	installed: ReadonlyMap<string, string | undefined>
): { path: string; contentHash: string; content?: string; unchanged?: true } {
	const contentHash = fnv1aHash(raw);
	if (installed.get(path) === contentHash) return { path, contentHash, unchanged: true };
	return { path, content: injectScriptHash(raw, contentHash), contentHash };
}

/** The reported binding files by path; a path reported twice keeps its last hash. */
function installedByPath(installed: readonly InstalledToolRef[]): Map<string, string | undefined> {
	return new Map(installed.map((ref) => [ref.path.replace(/^\.\//, ''), ref.contentHash]));
}

/** Extract the skill id from a glob path like `/.claude/skills/<id>/SKILL.md`. */
function skillIdFromPath(path: string): string | null {
	const match = /\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
	return match ? match[1] : null;
}

/**
 * Build the published catalog from `path → raw SKILL.md` (the adapter's glob
 * result). Unknown ids are dropped (allowlist); order follows the allowlist so
 * the primary end-to-end skill (lyriks-build) lists first.
 */
export function buildSkillCatalog(files: Record<string, string>): Skill[] {
	const byId = new Map<string, string>();
	for (const [path, raw] of Object.entries(files)) {
		const id = skillIdFromPath(path);
		if (id) byId.set(id, raw);
	}
	const catalog: Skill[] = [];
	for (const id of PUBLISHED_SKILL_IDS) {
		const raw = byId.get(id);
		if (raw === undefined) {
			// Never throw here: this runs inside customer appliances and a throw
			// would crash-loop them. The image build is guarded separately by
			// scripts/check-skill-catalog.mjs; this line is the runtime trace.
			console.error(
				`[skill-catalog] published skill "${id}" has no bundled SKILL.md; this build shipped without it (check the .dockerignore/.gitignore re-includes for .claude/skills/${id}).`
			);
			continue;
		}
		const meta = parseFrontmatter(raw);
		const contentHash = fnv1aHash(raw);
		const name = meta.name || id;
		const description = meta.description ?? '';
		catalog.push({
			id,
			name,
			description,
			content: raw,
			installContent: injectContentHash(raw, contentHash),
			installTargets: buildInstallTargets(id, name, description),
			sizeBytes: new TextEncoder().encode(raw).length,
			contentHash
		});
	}
	return catalog;
}

/**
 * Diff a client's installed skills against the published catalog:
 *  - "new"        — published but the client didn't report it;
 *  - "update"     — reported with a different hash, or with no hash at all;
 *  - "up-to-date" — reported hash matches the published one.
 * `installContent` rides along only when there is something to (re)write.
 * Ids the client reported that we don't publish land in `unknown` — they are
 * someone else's skills and must be left alone (never suggest deletion).
 * A known `client` narrows the layouts to that runtime's own; otherwise all
 * of them come back and the agent picks.
 */
export function diffSkillCatalog(
	catalog: Skill[],
	installed: InstalledSkillRef[],
	client?: SkillClientId,
	options: SkillSyncOptions = {}
): SkillSyncResult {
	const reported = new Map<string, InstalledSkillRef>();
	for (const ref of installed) reported.set(ref.id, ref);

	const published = new Set(catalog.map((skill) => skill.id));
	const selected = options.skillIds ? new Set(options.skillIds) : null;
	const skills: SkillSyncEntry[] = catalog.filter((skill) => !selected || selected.has(skill.id)).map((skill) => {
		const local = reported.get(skill.id);
		const status: SkillSyncEntry['status'] = !local
			? 'new'
			: local.contentHash === skill.contentHash
				? 'up-to-date'
				: 'update';
		// An unknown client id must not silently yield zero targets: fall back to
		// the full list rather than hand back an entry nothing can be written from.
		const narrowed = client
			? skill.installTargets.filter((target) => target.client === client)
			: skill.installTargets;
		// A guide the client already holds needs nothing written: its id, status
		// and hash say so. Its description and layouts came back on every
		// session's first sync and made a routine check weigh 18,000 characters.
		if (status === 'up-to-date') return { id: skill.id, name: skill.name, contentHash: skill.contentHash, status };
		const entry: SkillSyncEntry = {
			id: skill.id,
			name: skill.name,
			description: skill.description,
			contentHash: skill.contentHash,
			status,
			installPath: skillInstallPath(skill.id),
			installTargets: narrowed.length > 0 ? narrowed : skill.installTargets
		};
		if (options.includeContent === false) entry.contentDeferred = true;
		else entry.installContent = skill.installContent;
		return entry;
	});

	return {
		skills,
		unknown: [...new Set([...installed.map((ref) => ref.id), ...(options.skillIds ?? [])])].filter((id) => !published.has(id))
	};
}

// The binding: the repository stays bound to its Lyriks project. Saying "use
// the Lyriks MCP" once must bind every later request, in every later session,
// for every user of the repository. sync_skills therefore also returns what
// makes that binding durable: a block in the instruction file each runtime
// always loads, and for Claude Code a hook that restates the rule on every
// prompt. It also carries the helper scripts the block refers to. Applying it
// is idempotent (marked region, verbatim files, deduplicated settings entry).

/** Delimiters of the binding block: one region per instruction file, replaced on every sync. */
export const BINDING_MARKERS = {
	open: '<!-- lyriks-binding -->',
	close: '<!-- /lyriks-binding -->'
} as const;

/** Where the Claude Code binding hook is written, relative to the workspace root. */
export const BINDING_HOOK_PATH = '.claude/hooks/lyriks-bound-prompt.mjs';
/** Where the Claude Code hook that allows the Lyriks tools is written (ac-mcp-binding-allows-tools). */
export const BINDING_TOOLS_HOOK_PATH = '.claude/hooks/lyriks-allow-tools.mjs';
/** The tools Claude Code runs that hook for: every MCP tool, the script telling the Lyriks ones apart. */
export const BINDING_TOOLS_HOOK_MATCHER = '^mcp__.*';
/** Claude Code's project settings, where the hook is wired. */
export const BINDING_SETTINGS_PATH = '.claude/settings.json';
/** Where the helper scripts go, relative to the workspace root: one folder, whatever the runtime. */
export const BINDING_TOOLS_DIR = '.lyriks/tools';

/**
 * The block every runtime gets in the instruction file it always loads. Names
 * the project when the sync was told which one, so a fresh session knows where
 * the spec lives without a lookup.
 */
export function buildBindingBlock(projectId?: string | null): string {
	const id = projectId?.trim();
	const where = id ? `the Lyriks project \`${id}\`` : 'its Lyriks project';
	return [
		BINDING_MARKERS.open,
		'## This product is specified in Lyriks',
		'',
		`Its spec lives in ${where} and nowhere else; the code is written from it. Every request about this product goes through the Lyriks MCP, without anyone repeating "update Lyriks": the binding holds for every request of every session.`,
		'',
		'- A change to what the product does (a capability, a rule, a screen, a field, a state, a flow, a message) is a SPEC CHANGE first: author it through the section tools (`apply_behavior_batch`, `patch_section`), then the code, then the index entries carrying their signature line and `sync_implementation_index`. The sync takes a partial index: send the entries of the features you touched, each action or surface with all of its children, never the whole file when it is large. Never let the code get ahead of the spec; a number only a measurement can settle is specified as a provisional constant, measured, then written once.',
		'- Evolution is OPTIONAL. Open an Evolution request (`get_evolution` / `apply_evolution_batch`, skill `lyriks-evolution`) only when the person asks for one, or asks for a change to be QUALIFIED before anyone decides it (what it would involve, an estimate, an impact report, a decision that belongs to someone else). Never open a dossier on your own for an ordinary change, and never hold a change back because no dossier exists; a change already carried by an open request continues there.',
		'- A question about how the product behaves, whether something is right, what is missing or what broke is a spec READ first (`get_behavior_feature`, `get_section`, `get_implementation_status` / `get_implementation_gaps` / `get_implementation_drift`, `simulate_behavior`). Never answer it from the code alone or from memory.',
		'- Lyriks answers what the product must do, why, and where the code implements it; your own code tools (your search, a code search service, a code graph, your editor) answer how the code is written. After the spec read, follow the places it gives (`code` on a `get_behavior_feature` read of an action or a surface: file, line, code line) into those tools and check the code against the spec; where they differ, tell the person instead of resolving it either way. A question about the code alone (how to call an API, an internal mechanism, a library, code the project does not specify) goes to your code tools directly, without a Lyriks call.',
		'- Only work with no user-visible effect (a refactor, a build or dependency fix, formatting) skips the spec; say so in one line. A request that contradicts the spec is surfaced, not coded around: say what the spec says and let the user decide.',
		`- The scripts in \`${BINDING_TOOLS_DIR}/\` do what a tool call cannot: \`sync-skills.mjs\` installs or updates the playbooks, this block, the hooks and the scripts from the server without passing them through the conversation (run the \`selfInstall.command\` that \`sync_skills\` returns), \`index-file.mjs upsert\` (or \`remove\`) edits \`.unspa.json\` without reformatting it, \`check-index.mjs --fix\` checks it against the code by signature text, \`ingest-results.mjs\` records test results (scenario proofs and criterion \`lastResult\`), \`sync-index.mjs\` and \`apply-batch.mjs\` send an index or a batch too large to type, \`attach-source.mjs\` attaches code files from the disk or a commit instead of retyping them, \`await-event.mjs\`, run in the background, waits for the request page in a live Evolution session without taking the chat away; each carries its version on a \`// contentHash:\` line near its top, which the next \`sync_skills\` call reports as \`installed_tools\` so unchanged scripts are not sent again.`,
		'- If the Lyriks MCP is not connected, say so and do not guess specified behavior from the code.',
		BINDING_MARKERS.close
	].join('\n');
}

/** The hook entry Claude Code runs on every prompt (a relative path: hooks run from the workspace root). */
export function buildBindingHookEntry(): BindingHookInstall['settingsEntry'] {
	return {
		type: 'command',
		command: `node ${BINDING_HOOK_PATH}`,
		timeout: 10,
		statusMessage: 'Lyriks binding'
	};
}

/**
 * The Claude Code hook install: the script (left out when the client holds
 * this version), and how to wire it in the project settings.
 */
export function buildBindingHook(script: string, installed: readonly InstalledToolRef[] = []): BindingHookInstall {
	const entry = buildBindingHookEntry();
	return {
		...installOrSkip(BINDING_HOOK_PATH, script, installedByPath(installed)),
		settingsPath: BINDING_SETTINGS_PATH,
		settingsEvent: 'UserPromptSubmit',
		settingsEntry: entry,
		settingsContent: JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [entry] }] } }, null, 2) + '\n'
	};
}

/**
 * The Claude Code hook that allows the Lyriks tools without a prompt, whatever
 * the person named the server (ac-mcp-binding-allows-tools): a retrospecification
 * calls them hundreds of times, and each prompt waited on the person.
 */
export function buildToolsHook(script: string, installed: readonly InstalledToolRef[] = []): BindingHookInstall {
	const entry = { type: 'command' as const, command: `node ${BINDING_TOOLS_HOOK_PATH}`, timeout: 10, statusMessage: 'Lyriks tools' };
	return {
		...installOrSkip(BINDING_TOOLS_HOOK_PATH, script, installedByPath(installed)),
		settingsPath: BINDING_SETTINGS_PATH,
		settingsEvent: 'PreToolUse',
		settingsMatcher: BINDING_TOOLS_HOOK_MATCHER,
		settingsEntry: entry,
		settingsContent: JSON.stringify({ hooks: { PreToolUse: [{ matcher: BINDING_TOOLS_HOOK_MATCHER, hooks: [entry] }] } }, null, 2) + '\n'
	};
}

/**
 * The helper scripts, in install order, each with the sentence an agent reads
 * to pick one. They exist because field sessions kept hand-writing a JSON-RPC
 * client to send an index or a batch too large for a tool argument, and kept
 * checking the index with line-exact comparisons that punish clean edits.
 */
export const BINDING_TOOLS: ReadonlyArray<{ file: string; purpose: string }> = [
	{
		file: 'sync-skills.mjs',
		purpose:
			'`node .lyriks/tools/sync-skills.mjs [--client claude|codex|gemini|copilot|generic] [--project <id>] [--json] [--url URL] [--token TOKEN]`: installs the playbooks, the binding block, the hooks and these scripts exactly as the server publishes them, without passing them through the conversation: it reports what the repository holds, writes what is new or stale, merges each block between its markers, wires the hooks into the project settings once, leaves a settings file that is not valid JSON untouched and says so, and prints only what it wrote. sync_skills answers with the command to run (`selfInstall.command`, endpoint and a ten-minute sign-in that reads playbooks only). Needs mcp-client.mjs and skills-apply.mjs beside it, nothing else.'
	},
	{
		file: 'skills-apply.mjs',
		purpose: 'Not run directly: how one sync_skills answer lands in the repository for sync-skills.mjs (files written verbatim, blocks merged between their markers, hooks wired once, a settings file that does not parse left alone).'
	},
	{
		file: 'index-file.mjs',
		purpose:
			'`node .lyriks/tools/index-file.mjs upsert <entries.json | -> [--sync [--feature <featureId>]] [--project <id>] [--dry-run] [--json]`, `... remove <key...>`, `... set-project <id>` and `... init [--project <id>]`: the only way to create or edit .unspa.json. Adds or replaces entries by key (the file holds `{ "<key>": { entry } }`), drops renamed or removed keys, and prints what it added, replaced and removed; every other entry keeps its exact bytes, so never rewrite the index with another tool. In a repository without an index, upsert (or init) creates it as `{ "projectId", "index" }` for the project --project or the binding block names. With --sync it sends what changed to sync_implementation_index: criterion keys alone, any other key as the whole slice of --feature (an action or surface travels with all of its children). The other scripts import it to find the index.'
	},
	{
		file: 'check-index.mjs',
		purpose:
			'`node .lyriks/tools/check-index.mjs [--fix] [--json] [--project <id>]`: checks every .unspa.json entry against the code the way the engine does (the signature is found by its text, `line` is a hint), reports every problem in one run, and with --fix rewrites the line numbers that moved. Replaces any line-exact checker. Warns when the projectId of the index differs from --project or from the binding block, and when a rule: entry (a refusal) sits in markup or a template (`ruleWarnings` in --json): a refusal is enforced on the server, so a control only the screen hides is a surface visibility plus a finding. Warnings never change the exit code.'
	},
	{
		file: 'ingest-results.mjs',
		purpose:
			'`node .lyriks/tools/ingest-results.mjs <report.json> [--criteria <map.json>] [--kind <kind>] [--revision <sha>] [--dry-run] [--json]`: reads a vitest or jest JSON report, keeps the tests whose title carries a scenario token `[unspa:<surfaceId>:<actionId>:<scenarioId>]` (the `titleToken` of export_behavior_scenarios), and stamps `verifiedAt` on each action whose every result passed, removes it from one with a failing result, and only reports an action that has no index entry. Located and proven are two claims: this is the only way `verifiedAt` gets written. It is also how an acceptance criterion becomes verified at the Verify step: a test whose title carries `[criterion:<id>]` (or that the --criteria map `{ "<criterionId>": ["<test title>"] }` names) writes `verification.lastResult { passed, at, summary, revision }` on the `criterion:<id>` entry (created when missing, kind from --kind, default unit), passed only when all its tests passed; the next sync reports it verified or failing. Every result names the commit of code it ran on (the last commit touching code, .unspa.json and test-report.json left out), with `dirty: true` when the tree held uncommitted code; a stamped action gets `verifiedRevision`. No network.'
	},
	{
		file: 'sync-index.mjs',
		purpose:
			'`node .lyriks/tools/sync-index.mjs [--feature <featureId>] [--project <id>] [--base-branch <branch>] [--no-git]`: sends .unspa.json to sync_implementation_index (the whole index, or the keys of one feature) and prints the counters with what each one means. The project is --project, else the projectId of the index, else the binding block; when the index and the binding block disagree it sends nothing and prints the command to run. In a git checkout it then reports what git says to the request built on the branch (report_code_state: repository without its credentials, branch, start commit, head, last commit of code, uncommitted code, proofs taken on another commit, the commits of the branch since its start) and prints the answer under `codeState`; a refusal is a warning, a branch no open Evolution request is built on is a note (`noRequest`).'
	},
	{
		file: 'report-merge.mjs',
		purpose:
			'`node .lyriks/tools/report-merge.mjs --branch <request branch> [--into <branch>] [--request <id>]`: run on the deployment branch after merging a request\'s branch; asks git whether the commit a person validated is in the merge and reports it (report_merge). Lyriks records the merge only then, and that is the moment the request\'s drafts become the official specification.'
	},
	{
		file: 'apply-batch.mjs',
		purpose:
			'`node .lyriks/tools/apply-batch.mjs <feature_id> <ops.json> [--dry-run | --commit TOKEN]`: sends a behavior batch read from a file to apply_behavior_batch and prints ok, errors, refs, commitToken and scenarios.'
	},
	{
		file: 'attach-source.mjs',
		purpose:
			'`node .lyriks/tools/attach-source.mjs <feature_id> <path...> [--commit SHA] [--kind code|file]`: attaches files as the evidence of one feature, read from the disk or, with --commit, from that commit (`git show`), and sent exactly as they are; prints each path with the source id spans and candidates name. Use it instead of passing a file to attach_source: a file retyped as a tool argument comes back altered and its span offsets point at the wrong text.'
	},
	{
		file: 'mcp-call.mjs',
		purpose:
			'`node .lyriks/tools/mcp-call.mjs <tool> <args.json | -> [--out FILE]`: calls any Lyriks MCP tool with arguments read from a file or stdin, and prints the result text or writes it to --out.'
	},
	{
		file: 'await-event.mjs',
		purpose:
			'`node .lyriks/tools/await-event.mjs <project_id> <request_id | -> <session_id> --url <MCP> [--token <ticket>]`, run as the `wait.command` start_evolution_session answers (it carries its own sign-in, nothing to set): waits in a live Evolution session for the person\'s next event on the request page (a click, their own progress, the end of the session) and exits printing it as JSON. Run it in the background (Claude Code: Bash with run_in_background) so the person\'s chat messages still reach you while you wait; you are woken when it ends: answer the event, then start it again.'
	},
	{
		file: 'mcp-client.mjs',
		purpose:
			'Not run directly: the Streamable HTTP MCP client the networked scripts import (endpoint from --url or LYRIKS_MCP_URL, bearer from --token or LYRIKS_MCP_TOKEN).'
	},
	{
		file: 'index-command.mjs',
		purpose: 'Not run directly: the upsert, remove and set-project commands of index-file.mjs.'
	},
	{
		file: 'index-init.mjs',
		purpose: 'Not run directly: the init command of index-file.mjs, and the index an upsert creates in a repository that has none.'
	},
	{
		file: 'index-text.mjs',
		purpose: 'Not run directly: rewrites only the entries that changed in the text of .unspa.json, in the style of their neighbours.'
	},
	{
		file: 'index-project.mjs',
		purpose:
			'Not run directly: picks the Lyriks project a script addresses (--project, the projectId of .unspa.json, the binding block) and warns when they disagree.'
	},
	{
		file: 'criteria-results.mjs',
		purpose: 'Not run directly: the acceptance-criterion half of ingest-results.mjs.'
	},
	{
		file: 'git-state.mjs',
		purpose: 'Not run directly: what git says of the checkout (repository, branch, head, last commit of code, uncommitted code, the commits of the branch since its start), for the scripts that report it; Lyriks never reads the repository itself.'
	},
	{
		file: 'code-state.mjs',
		purpose: 'Not run directly: reports what git says of the checkout to the request built on its branch (report_code_state) for sync-index.mjs; a branch no open request is built on is a note, never a refusal.'
	}
];

/**
 * The installable scripts from `path -> raw file` (the adapter's glob result),
 * matched by file name. A script missing from the bundle is logged and left
 * out rather than thrown on: this runs inside customer appliances, where a
 * throw on every sync would cost far more than a missing helper.
 */
export function buildBindingTools(
	files: Readonly<Record<string, string>>,
	installed: readonly InstalledToolRef[] = []
): BindingToolInstall[] {
	const held = installedByPath(installed);
	const byName = new Map<string, string>();
	for (const [path, raw] of Object.entries(files)) byName.set(path.slice(path.lastIndexOf('/') + 1), raw);
	const tools: BindingToolInstall[] = [];
	for (const { file, purpose } of BINDING_TOOLS) {
		const content = byName.get(file);
		if (content === undefined) {
			console.error(`[skill-catalog] helper script "${file}" is not in the bundle; this build shipped without it.`);
			continue;
		}
		// An unchanged script keeps its purpose home, like its content: the client
		// read it when it installed the file, and the file's header says it again.
		const install = installOrSkip(`${BINDING_TOOLS_DIR}/${file}`, content, held);
		tools.push(install.unchanged ? install : { ...install, purpose });
	}
	return tools;
}

/**
 * The binding for one sync: one target per runtime (narrowed like the skill
 * layouts when the client names itself), the same block for all, the hook for
 * Claude Code alone, the helper scripts for everyone (plain Node, no runtime
 * involved). Claude Code discovers skills natively but still reads CLAUDE.md,
 * which is where its block goes; it also gets the hook that allows the Lyriks
 * tools, when that script is given. A script or hook the client reported with
 * the published hash (`installedTools`) comes back `unchanged`, without content.
 */
export function buildBinding(
	hookScript: string,
	client?: SkillClientId,
	projectId?: string | null,
	toolFiles: Readonly<Record<string, string>> = {},
	installedTools: readonly InstalledToolRef[] = [],
	toolsHookScript?: string
): SkillBinding {
	const block = buildBindingBlock(projectId);
	const hook = buildBindingHook(hookScript, installedTools);
	const toolsHook = toolsHookScript ? buildToolsHook(toolsHookScript, installedTools) : null;
	const targets: BindingInstallTarget[] = CLIENT_LAYOUTS.map((layout) => {
		const target: BindingInstallTarget = {
			client: layout.client,
			label: layout.label,
			pointerPath: layout.pointerPath ?? 'CLAUDE.md',
			pointerBlock: block
		};
		if (layout.client === 'claude') {
			target.hook = hook;
			if (toolsHook) target.toolsHook = toolsHook;
		}
		return target;
	});
	const narrowed = client ? targets.filter((target) => target.client === client) : targets;
	return {
		projectId: projectId?.trim() || null,
		markers: { ...BINDING_MARKERS },
		targets: narrowed.length > 0 ? narrowed : targets,
		tools: buildBindingTools(toolFiles, installedTools)
	};
}
