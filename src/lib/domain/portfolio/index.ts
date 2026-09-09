import type { SourceModeCode } from '$domain/foundation/identity-enums';
/**
 * The portfolio layer above the wizard: one Portfolio (per install) groups
 * Projects into custom-named Domains. A project's org metadata (which domain)
 * is stored; every figure on a card (delivery stage, readiness, coherence,
 * production, components, last activity) is DERIVED from the wizard
 * steps. Readiness = breadth/buildability; coherence = correctness — two
 * orthogonal scores, never conflated.
 */

/* ── Domains ──────────────────────────────────────────────────────────── */

export interface Domain {
	id: string;
	name: string;
	description: string;
	icon: string;
	createdAt: string;
}

/** URL-safe domain id from its name, with a caller-supplied uniqueness suffix. */
export function makeDomainId(name: string, suffix: string): string {
	const slug =
		name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'domain';
	return `dom-${slug}-${suffix}`;
}

/**
 * Human-readable domain name from a raw id/slug — used when a domain has to be
 * materialised from a caller-supplied id (e.g. an MCP `domain_id`) that has no
 * name attached. Strips a leading `dom-` and any trailing uniqueness suffix,
 * then title-cases the remaining words.
 */
export function humanizeDomainName(id: string): string {
	// A generated id is `dom-<slug>-<6-char suffix>`; strip both. An arbitrary
	// caller id (e.g. "mcp-test") keeps every word — never chop a trailing word
	// just because it happens to be six characters long.
	const core = id.trim().startsWith('dom-')
		? id.trim().replace(/^dom-/, '').replace(/-[a-z0-9]{6}$/, '')
		: id.trim();
	const words = core.split(/[-_\s]+/).filter(Boolean);
	if (words.length === 0) return 'Untitled domain';
	return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* ── Stages ───────────────────────────────────────────────────────────── */

export const PROJECT_STAGES = [
	{ code: 'ideation', label: 'Ideation' },
	{ code: 'spec_in_progress', label: 'Spec in progress' },
	{ code: 'mvp_in_progress', label: 'MVP in progress' },
	{ code: 'v1_shipped', label: 'V1 shipped' },
	{ code: 'v2_in_progress', label: 'V2 in progress' }
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number]['code'];

export const DEFAULT_STAGE: ProjectStage = 'ideation';

export function stageLabel(code: string): string {
	return PROJECT_STAGES.find((s) => s.code === code)?.label ?? code;
}

/**
 * Behavioral maturity from which a project has left pure specification and is
 * building its MVP: enough leaves carry authored behavior to be implementable.
 */
const MVP_STAGE_MATURITY = 25;

/**
 * Structural breadth from which specification work has visibly started. Below
 * it the project is still an idea: creating a project writes a Foundation
 * identity stub (the name and one-liner the modal collects), which moves
 * coverage by a point or two on its own — that is not spec work.
 */
const SPEC_STAGE_COVERAGE = 10;

/** What a stage is read from: live spec signals, plus the human shipping call. */
export interface StageSignals {
	/** Structural breadth across the sections (0–100). */
	coverageScore: number;
	/** Behavior maturity across the leaf features (0–100). */
	maturityScore: number;
	featureCount: number;
	/**
	 * When a HUMAN declared the product shipped, else null. Shipping is a fact
	 * about the world, not about the spec: no score, no completion gate and no
	 * agent may set it — only a person, from the portfolio.
	 */
	shippedAt: string | null;
	/** Freshest save across every section, null when nothing was ever saved. */
	lastActivityAt: string | null;
}

/**
 * The pre-ship stages are DERIVED, never chosen: they are a reading of the live
 * signals, so they can never claim more than the spec actually contains.
 *   ideation ......... nothing beyond the idea itself
 *   spec_in_progress . sections/features exist, behavior is not implementable yet
 *   mvp_in_progress .. leaves carry real authored behavior
 * The two shipped stages hang off the human declaration instead:
 *   v1_shipped ....... a person marked it shipped and nothing moved since
 *   v2_in_progress ... authoring resumed after that declaration
 */
export function deriveProjectStage(signals: StageSignals): ProjectStage {
	if (signals.shippedAt) {
		return signals.lastActivityAt && signals.lastActivityAt > signals.shippedAt
			? 'v2_in_progress'
			: 'v1_shipped';
	}
	if (signals.maturityScore >= MVP_STAGE_MATURITY) return 'mvp_in_progress';
	if (
		signals.coverageScore >= SPEC_STAGE_COVERAGE ||
		signals.maturityScore > 0 ||
		signals.featureCount > 0
	) {
		return 'spec_in_progress';
	}
	return 'ideation';
}

/* ── Project cards + rollups ──────────────────────────────────────────── */

/** A project as shown on a domain board — org metadata + derived metrics. */
export interface ProjectCard {
	id: string;
	name: string;
	description: string;
	domainId: string | null;
	stage: ProjectStage;
	/** Structural breadth — presence & completeness, maturity excluded (0–100). */
	coverageScore: number;
	/** Behavior maturity — the maturity dimension's own score (0–100). */
	maturityScore: number;
	/** Breadth/buildability (0–100). */
	readinessScore: number;
	/** Correctness (0–100) — 100 minus open incoherences. */
	coherenceScore: number;
	/** Number of leaf features (the leaf-feature count — NOT reusable UI components). */
	featureCount: number;
	lastSavedAt: string | null;
	/** Where the project started (its Foundation identity); `code_to_spec` = created from a codebase. */
	sourceMode: SourceModeCode | null;
}

export interface DomainWithProjects {
	domain: Domain;
	projects: ProjectCard[];
	byStage: { stage: ProjectStage; label: string; count: number }[];
}

export interface PortfolioView {
	domains: DomainWithProjects[];
	/** Projects not yet assigned to any domain. */
	unassigned: ProjectCard[];
	domainCount: number;
	projectCount: number;
	avgReadiness: number;
	avgCoherence: number;
}

const avg = (ns: number[]): number =>
	ns.length === 0 ? 0 : Math.round(ns.reduce((s, n) => s + n, 0) / ns.length);

/** Group already-derived project cards under their domains + compute rollups. */
export function assemblePortfolio(domains: Domain[], cards: ProjectCard[]): PortfolioView {
	const withProjects: DomainWithProjects[] = domains.map((domain) => {
		const projects = cards.filter((c) => c.domainId === domain.id);
		return {
			domain,
			projects,
			byStage: PROJECT_STAGES.map((s) => ({
				stage: s.code,
				label: s.label,
				count: projects.filter((p) => p.stage === s.code).length
			})).filter((x) => x.count > 0)
		};
	});
	const known = new Set(domains.map((d) => d.id));
	const unassigned = cards.filter((c) => !c.domainId || !known.has(c.domainId));
	return {
		domains: withProjects,
		unassigned,
		domainCount: domains.length,
		projectCount: cards.length,
		avgReadiness: avg(cards.map((c) => c.readinessScore)),
		avgCoherence: avg(cards.map((c) => c.coherenceScore))
	};
}
