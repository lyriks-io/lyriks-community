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
		const entry: SkillSyncEntry = {
			id: skill.id,
			name: skill.name,
			description: skill.description,
			contentHash: skill.contentHash,
			status,
			installPath: skillInstallPath(skill.id),
			installTargets: narrowed.length > 0 ? narrowed : skill.installTargets
		};
		if (status !== 'up-to-date') {
			if (options.includeContent === false) entry.contentDeferred = true;
			else entry.installContent = skill.installContent;
		}
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
		'- A change to what the product does (a capability, a rule, a screen, a field, a state, a flow, a message) is a SPEC CHANGE first: author it through the section tools (`apply_behavior_batch`, `patch_section`, `build_screen`, `wire_element`), then the code, then the index entries carrying their signature line and `sync_implementation_index`. The sync takes a partial index: send the entries of the features you touched, each action or surface with all of its children, never the whole file when it is large. Never let the code get ahead of the spec; a number only a measurement can settle is specified as a provisional constant, measured, then written once.',
		'- Evolution is OPTIONAL. Open an Evolution request (`get_evolution` / `apply_evolution_batch`, skill `lyriks-evolution`) only when the person asks for one, or asks for a change to be QUALIFIED before anyone decides it (what it would involve, an estimate, an impact report, a decision that belongs to someone else). Never open a dossier on your own for an ordinary change, and never hold a change back because no dossier exists; a change already carried by an open request continues there.',
		'- A question about how the product behaves, whether something is right, what is missing or what broke is a spec READ first (`get_behavior_feature`, `get_section`, `get_implementation_status` / `get_implementation_gaps` / `get_implementation_drift`, `simulate_experience`, `verify_experience`). Never answer from the code alone or from memory.',
		'- Only work with no user-visible effect (a refactor, a build or dependency fix, formatting) skips the spec; say so in one line. A request that contradicts the spec is surfaced, not coded around: say what the spec says and let the user decide.',
		`- The scripts in \`${BINDING_TOOLS_DIR}/\` do what a tool call cannot: \`index-file.mjs upsert\` (or \`remove\`) edits \`.unspa.json\` without reformatting it, \`check-index.mjs --fix\` checks it against the code by signature text, \`ingest-results.mjs\` records test results (scenario proofs and criterion \`lastResult\`), \`sync-index.mjs\` and \`apply-batch.mjs\` send an index or a batch too large to type; each carries its version on a \`// contentHash:\` line near its top, which the next \`sync_skills\` call reports as \`installed_tools\` so unchanged scripts are not sent again.`,
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
 * The helper scripts, in install order, each with the sentence an agent reads
 * to pick one. They exist because field sessions kept hand-writing a JSON-RPC
 * client to send an index or a batch too large for a tool argument, and kept
 * checking the index with line-exact comparisons that punish clean edits.
 */
export const BINDING_TOOLS: ReadonlyArray<{ file: string; purpose: string }> = [
	{
		file: 'index-file.mjs',
		purpose:
			'`node .lyriks/tools/index-file.mjs upsert <entries.json | -> [--sync [--feature <featureId>]] [--project <id>] [--dry-run] [--json]`, `... remove <key...>` and `... set-project <id>`: the only way to edit .unspa.json. Adds or replaces entries by key (the file holds `{ "<key>": { entry } }`), drops renamed or removed keys, and prints what it added, replaced and removed; every other entry keeps its exact bytes, so never rewrite the index with another tool. With --sync it sends what changed to sync_implementation_index: criterion keys alone, any other key as the whole slice of --feature (an action or surface travels with all of its children). The other scripts import it to find the index.'
	},
	{
		file: 'check-index.mjs',
		purpose:
			'`node .lyriks/tools/check-index.mjs [--fix] [--json] [--project <id>]`: checks every .unspa.json entry against the code the way the engine does (the signature is found by its text, `line` is a hint), reports every problem in one run, and with --fix rewrites the line numbers that moved. Replaces any line-exact checker. Warns when the projectId of the index differs from --project or from the binding block.'
	},
	{
		file: 'ingest-results.mjs',
		purpose:
			'`node .lyriks/tools/ingest-results.mjs <report.json> [--criteria <map.json>] [--kind <kind>] [--revision <sha>] [--dry-run] [--json]`: reads a vitest or jest JSON report, keeps the tests whose title carries a scenario token `[unspa:<surfaceId>:<actionId>:<scenarioId>]` (the `titleToken` of export_behavior_scenarios), and stamps `verifiedAt` on each action whose every result passed, removes it from one with a failing result, and only reports an action that has no index entry. Located and proven are two claims: this is the only way `verifiedAt` gets written. It is also how an acceptance criterion becomes verified at the Verify step: a test whose title carries `[criterion:<id>]` (or that the --criteria map `{ "<criterionId>": ["<test title>"] }` names) writes `verification.lastResult { passed, at, summary, revision }` on the `criterion:<id>` entry (created when missing, kind from --kind, default unit), passed only when all its tests passed; the next sync reports it verified or failing. No network.'
	},
	{
		file: 'sync-index.mjs',
		purpose:
			'`node .lyriks/tools/sync-index.mjs [--feature <featureId>] [--project <id>]`: sends .unspa.json to sync_implementation_index (the whole index, or the keys of one feature) and prints the counters with what each one means. The project is --project, else the projectId of the index, else the binding block; when the index and the binding block disagree it sends nothing and prints the command to run.'
	},
	{
		file: 'apply-batch.mjs',
		purpose:
			'`node .lyriks/tools/apply-batch.mjs <feature_id> <ops.json> [--dry-run | --commit TOKEN]`: sends a behavior batch read from a file to apply_behavior_batch and prints ok, errors, refs, commitToken and scenarios.'
	},
	{
		file: 'mcp-call.mjs',
		purpose:
			'`node .lyriks/tools/mcp-call.mjs <tool> <args.json | -> [--out FILE]`: calls any Lyriks MCP tool with arguments read from a file or stdin, and prints the result text or writes it to --out.'
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
		tools.push({ ...installOrSkip(`${BINDING_TOOLS_DIR}/${file}`, content, held), purpose });
	}
	return tools;
}

/**
 * The binding for one sync: one target per runtime (narrowed like the skill
 * layouts when the client names itself), the same block for all, the hook for
 * Claude Code alone, the helper scripts for everyone (plain Node, no runtime
 * involved). Claude Code discovers skills natively but still reads CLAUDE.md,
 * which is where its block goes. A script or hook the client reported with
 * the published hash (`installedTools`) comes back `unchanged`, without content.
 */
export function buildBinding(
	hookScript: string,
	client?: SkillClientId,
	projectId?: string | null,
	toolFiles: Readonly<Record<string, string>> = {},
	installedTools: readonly InstalledToolRef[] = []
): SkillBinding {
	const block = buildBindingBlock(projectId);
	const hook = buildBindingHook(hookScript, installedTools);
	const targets: BindingInstallTarget[] = CLIENT_LAYOUTS.map((layout) => {
		const target: BindingInstallTarget = {
			client: layout.client,
			label: layout.label,
			pointerPath: layout.pointerPath ?? 'CLAUDE.md',
			pointerBlock: block
		};
		if (layout.client === 'claude') target.hook = hook;
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
