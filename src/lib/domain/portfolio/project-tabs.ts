import type { StartWay } from './project-start';

/**
 * The tabs a project opens in the app bar, which grow with the project
 * (the design's progressive navigation):
 *
 * - Retrospecification while an existing product's specification is being
 *   rebuilt, up to the moment the team opens it for validation; a later run
 *   reads a product that already has its specification, so it shows above the
 *   Specification 360° and takes nothing away (criterion 9359cb3c);
 * - Specification 360° from that moment, or at once for a product the team
 *   describes itself or builds from scratch, or one whose specification was
 *   written without a retrospecification; it wears DRAFT until the team
 *   validates it, then VALIDATED (in the app bar, a ring that fills as elements
 *   are validated, then a check);
 * - Evolutions once the specification is validated, for a product built from
 *   scratch as soon as its specification holds a feature (an evolution changes
 *   a product its specification describes, criterion 40bef6da), and always for
 *   a project that already has evolutions, so no work in progress ever loses
 *   its tab.
 */
export type ProjectTab = 'retro' | 'spec' | 'evolutions';

/** Where the retrospecification stands (`RetrospecStatusKind`), null when the project never had one. */
export type RetroStage = 'start' | 'source' | 'running' | 'bilan' | 'review' | 'done';

export interface ProjectTabFacts {
	readonly start: StartWay | null;
	readonly retro: RetroStage | null;
	/** The run under way starts from a specification already gathered: a later run, never a first one. */
	readonly retroComplementary: boolean;
	/** The specification already holds features. */
	readonly hasSpec: boolean;
	/** The Specification 360°'s validation, null when it cannot be read. */
	readonly spec: 'draft' | 'validated' | null;
	/** Elements of the specification, and how many every required validator validated; null when it cannot be read. */
	readonly specCount: SpecCount | null;
	readonly evolutions: number;
}

export interface SpecCount {
	readonly validated: number;
	readonly total: number;
}

export interface ProjectTabs {
	readonly tabs: readonly ProjectTab[];
	/** The badge the Specification 360° tab wears. */
	readonly specBadge: 'draft' | 'validated' | null;
	/** How far a DRAFT specification's validation went; null for any other badge. */
	readonly specProgress: SpecCount | null;
	/** The project had a Reverse-Specification: the navigation keeps its entry once the run is over (criterion b2f17eef). */
	readonly reversed: boolean;
	/** A later Reverse-Specification is not validated yet: Mismatch holds its report (criterion f61f8c94). */
	readonly laterRunOpen: boolean;
}

/** A retrospecification under way: the specification is not the team's to validate yet. */
const RETRO_UNDER_WAY: readonly RetroStage[] = ['source', 'running', 'bilan'];

const underWay = (f: ProjectTabFacts): boolean => !!f.retro && RETRO_UNDER_WAY.includes(f.retro);

function specOpen(f: ProjectTabFacts): boolean {
	if (f.start === 'manual' || f.start === 'scratch') return true;
	if (f.retro === 'review' || f.retro === 'done') return true;
	if (underWay(f)) return f.retroComplementary;
	return f.hasSpec || f.spec === 'validated';
}

export function projectTabs(f: ProjectTabFacts): ProjectTabs {
	const scratch = f.start === 'scratch';
	const spec = specOpen(f);
	const validated = f.spec === 'validated';
	const tabs: ProjectTab[] = [];
	if (!scratch && (!spec || underWay(f))) tabs.push('retro');
	if (spec) tabs.push('spec');
	if ((scratch && f.hasSpec) || validated || f.evolutions > 0) tabs.push('evolutions');
	const specBadge = spec ? (validated ? 'validated' : 'draft') : null;
	return { tabs, specBadge, specProgress: specBadge === 'draft' ? f.specCount : null, reversed: !!f.retro && f.retro !== 'start', laterRunOpen: f.retroComplementary && !!f.retro && f.retro !== 'start' && f.retro !== 'done' };
}
