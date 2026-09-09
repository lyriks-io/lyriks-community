import type {
	InstalledSkillRef,
	Skill,
	SkillClientId,
	SkillInstallTarget,
	SkillSyncEntry,
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
	'lyriks-delivery'
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
	client?: SkillClientId
): SkillSyncResult {
	const reported = new Map<string, InstalledSkillRef>();
	for (const ref of installed) reported.set(ref.id, ref);

	const published = new Set(catalog.map((skill) => skill.id));
	const skills: SkillSyncEntry[] = catalog.map((skill) => {
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
		if (status !== 'up-to-date') entry.installContent = skill.installContent;
		return entry;
	});

	return {
		skills,
		unknown: installed.map((ref) => ref.id).filter((id) => !published.has(id))
	};
}
