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
	/** Content deliberately omitted; fetch get_skill before installing or following it. */
	contentDeferred?: true;
}

/**
 * The per-prompt hook Claude Code runs once the repository is bound: it
 * restates the binding on EVERY prompt, so a long conversation cannot drift
 * back to code-only work. Written verbatim, wired in the project settings.
 */
export interface BindingHookInstall {
	/** Where the script goes, relative to the workspace root. */
	path: string;
	/** The script, written verbatim. */
	content: string;
	/** Fingerprint of `content`, so a client can tell a stale copy. */
	contentHash: string;
	/** The Claude Code project settings file the hook is wired in. */
	settingsPath: string;
	/** The hook event the entry belongs to. */
	settingsEvent: 'UserPromptSubmit';
	/** The entry to add under `hooks.<settingsEvent>[].hooks`, unless a command naming `path` is already there. */
	settingsEntry: { type: 'command'; command: string; timeout: number; statusMessage: string };
	/** The whole settings file to write when `settingsPath` does not exist yet. */
	settingsContent: string;
}

export interface BindingInstallTarget {
	client: SkillClientId;
	label: string;
	/** The instruction file this runtime always loads (CLAUDE.md, AGENTS.md, GEMINI.md, copilot-instructions.md). */
	pointerPath: string;
	/** The block merged there between the binding markers: replace the region when present, append otherwise. */
	pointerBlock: string;
	/** Claude Code only: the per-prompt hook restating the binding. */
	hook?: BindingHookInstall;
}

/**
 * A helper script installed next to the skills, under `.lyriks/tools/`. Plain
 * Node with no dependency, so it is the same file for every runtime. It covers
 * what an agent cannot do through a tool call (an index or a batch too large to
 * type as an argument) or should not improvise (checking the index against the
 * code). The scripts import each other by relative path: install them all, side
 * by side.
 */
export interface BindingToolInstall {
	/** Where the script goes, relative to the workspace root. */
	path: string;
	/** The script, written verbatim. */
	content: string;
	/** Fingerprint of `content`, so a client can tell a stale copy. */
	contentHash: string;
	/** One sentence: what it does and how it is invoked. */
	purpose: string;
}

/**
 * What keeps a repository bound to its Lyriks project beyond the session that
 * first asked for Lyriks: a block in the instruction file every runtime loads
 * (so every later session, for every user, starts bound) and, for Claude
 * Code, a hook that restates the rule on every prompt. It also carries the
 * helper scripts the block and the skills refer to. Idempotent to apply.
 */
export interface SkillBinding {
	/** The project the block names, when the sync was told which one. */
	projectId: string | null;
	markers: { open: string; close: string };
	targets: BindingInstallTarget[];
	/** The helper scripts every runtime installs, whichever target it picked. */
	tools: BindingToolInstall[];
}

export interface SkillSyncResult {
	skills: SkillSyncEntry[];
	/** Ids the client reported that this server does not publish — leave them alone. */
	unknown: string[];
	/** The binding to (re)apply on every sync; absent only from a pure catalog diff. */
	binding?: SkillBinding;
}

export interface SkillCatalogPort {
	listSkills(): SkillSummary[];
	getSkill(id: string): Skill | null;
	/**
	 * Diff the client's installed set against the published catalog. `client`
	 * narrows `installTargets` to the caller's own layout when it knows what it
	 * is; omitted, every layout comes back and the agent chooses. `projectId`
	 * (the wizard project slug this repository is specified in) makes the
	 * binding block name the project; omitted, the block stays generic.
	 */
	syncSkills(installed: InstalledSkillRef[], client?: SkillClientId, projectId?: string, options?: SkillSyncOptions): SkillSyncResult;
}

/** Optional selective reads; absence preserves the full synchronization contract. */
export interface SkillSyncOptions {
	skillIds?: readonly string[];
	includeContent?: boolean;
}
