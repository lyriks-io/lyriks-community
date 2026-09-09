/**
 * Outbound port for the authoring-skill catalog: the operator-facing "skills"
 * (SKILL.md playbooks) an MCP-connected agent can discover, self-install and
 * keep in sync. The catalog is read-only and bundled with the appliance
 * (air-gapped — no filesystem or network reads at runtime), so every method
 * is synchronous.
 *
 * Installation is vendor-neutral: the same file is written to whichever layout
 * the calling agent uses, and clients without native skill discovery get a
 * marked pointer block merged into the instruction file they already read.
 */

/** Agent runtimes we publish an install layout for; `generic` covers the rest. */
export type SkillClientId = 'claude' | 'codex' | 'gemini' | 'copilot' | 'generic';

export interface SkillInstallTarget {
	client: SkillClientId;
	/** Human label for the Settings list, e.g. "Claude Code". */
	label: string;
	/** Where the skill body goes, relative to the agent workspace root. */
	path: string;
	/**
	 * Instruction file this client already reads, which must reference `path`
	 * for the skill to be picked up. Absent when the client discovers `path`
	 * natively (Claude Code), in which case writing the file is enough.
	 */
	pointerPath?: string;
	/**
	 * The block to merge into `pointerPath`, delimited by stable HTML comment
	 * markers so a re-install replaces its own region and never touches the
	 * rest of a file the user also owns. Present with `pointerPath`.
	 */
	pointerBlock?: string;
}

export interface SkillSummary {
	/** Stable skill id — also the install directory name. */
	id: string;
	/** Human name from the SKILL.md frontmatter. */
	name: string;
	/** One-paragraph description from the SKILL.md frontmatter. */
	description: string;
	/** Size of the raw SKILL.md in bytes (UTF-8). */
	sizeBytes: number;
	/** Fingerprint (FNV-1a hex) of the ORIGINAL SKILL.md — the version marker. */
	contentHash: string;
}

export interface Skill extends SkillSummary {
	/** The raw SKILL.md file, frontmatter included — the authored original. */
	content: string;
	/**
	 * What an agent installs: `content` with a `contentHash: <hash>` line
	 * injected into the frontmatter, so the installed copy self-reports its
	 * version (read the first lines — no client-side hashing needed).
	 */
	installContent: string;
	/** One entry per supported runtime; the agent picks the one it is. */
	installTargets: SkillInstallTarget[];
}

/** What a client reports about one locally installed skill (hash optional). */
export interface InstalledSkillRef {
	id: string;
	contentHash?: string;
}

export type SkillSyncStatus = 'up-to-date' | 'update' | 'new';

export interface SkillSyncEntry {
	id: string;
	name: string;
	description: string;
	contentHash: string;
	/** "new" = not installed; "update" = stale or unhashed; "up-to-date" = hash matches. */
	status: SkillSyncStatus;
	/**
	 * Claude Code's path, kept as a scalar for clients written against the
	 * original single-layout contract. New clients read `installTargets`.
	 */
	installPath: string;
	installTargets: SkillInstallTarget[];
	/** Present only when status ≠ "up-to-date" — the file to write verbatim. */
	installContent?: string;
}

export interface SkillSyncResult {
	skills: SkillSyncEntry[];
	/** Ids the client reported that this server does not publish — leave them alone. */
	unknown: string[];
}

export interface SkillCatalogPort {
	listSkills(): SkillSummary[];
	getSkill(id: string): Skill | null;
	/**
	 * Diff the client's installed set against the published catalog. `client`
	 * narrows `installTargets` to the caller's own layout when it knows what it
	 * is; omitted, every layout comes back and the agent chooses.
	 */
	syncSkills(installed: InstalledSkillRef[], client?: SkillClientId): SkillSyncResult;
}
