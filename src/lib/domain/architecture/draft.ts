import type { ArchLayer, ConstraintCategory, DocKind } from './enums';

/* ── Entities — mirror of Unspaghettit feature 8c799e4a ─────────────── */

export interface TechChoice {
	readonly id: string;
	layer: ArchLayer;
	name: string;
	role: string;
	version: string;
	/** Id of the Documents & Sources row documenting this choice (its official docs). */
	referenceDocId: string | null;
	description: string;
}

/**
 * A reference doc as Architecture used to store it, before Documents & Sources
 * became the project's single evidence register.
 *
 * RETAINED FOR MIGRATION ONLY — nothing authors these any more. Existing rows
 * are folded into the register by id (see `LoadDocumentRegisterUseCase`), so a
 * project saved before the change keeps its links and the citations that point
 * at them keep resolving.
 */
export interface ReferenceDoc {
	readonly id: string;
	title: string;
	url: string;
	kind: DocKind;
	description: string;
}

export interface Constraint {
	readonly id: string;
	title: string;
	detail: string;
	category: ConstraintCategory;
}

/** A tech name + layer seeded read-only from Step 02 (stack/integrations) + Step 07 (infra). */
export interface DerivedTech {
	name: string;
	layer: ArchLayer;
}

/**
 * The persisted content of Step 08. `derivedTech` is a read-only mirror of the
 * stack/infra declared upstream — refreshed on load, never authored.
 */
export interface ProjectArchitectureDraft {
	projectId: string;
	techChoices: TechChoice[];
	/** Ids from the project Documents & Sources register backing the stack + constraints. */
	sourceIds: string[];
	/** @deprecated Legacy private doc list, kept only so old projects migrate losslessly. */
	referenceDocs: ReferenceDoc[];
	constraints: Constraint[];
	derivedTech: DerivedTech[];
	lastSavedAt: string | null;
}

export function createEmptyArchitectureDraft(projectId: string): ProjectArchitectureDraft {
	return {
		projectId,
		techChoices: [],
		sourceIds: [],
		referenceDocs: [],
		constraints: [],
		derivedTech: [],
		lastSavedAt: null
	};
}

function newId(): string {
	return crypto.randomUUID();
}

export function createTechChoice(layer: ArchLayer, overrides: Partial<TechChoice> = {}): TechChoice {
	return {
		id: newId(),
		layer,
		name: '',
		role: '',
		version: '',
		referenceDocId: null,
		description: '',
		...overrides
	};
}

export function createReferenceDoc(overrides: Partial<ReferenceDoc> = {}): ReferenceDoc {
	return { id: newId(), title: '', url: '', kind: 'docs', description: '', ...overrides };
}

export function createConstraint(overrides: Partial<Constraint> = {}): Constraint {
	return { id: newId(), title: '', detail: '', category: 'data_residency', ...overrides };
}

/**
 * Guarantee a stable id on every keyed collection. Legacy, seeded, or
 * derived rows may lack one, which would collide as duplicate `undefined`
 * keys in the UI's keyed `{#each}` blocks. Applied at both the load and parse
 * boundaries so no id-less row ever reaches a component.
 */
export function withStableArchitectureIds(
	draft: ProjectArchitectureDraft
): ProjectArchitectureDraft {
	const fix = <T extends { id: string }>(items: T[], prefix: string): T[] => {
		const seen = new Set<string>();
		return items.flatMap((item, index) => {
			if (!item || typeof item !== 'object') return [];
			const explicit = typeof item.id === 'string' && item.id.trim() ? item.id : null;
			if (explicit && seen.has(explicit)) return [];
			const label = String(
				(item as unknown as Record<string, unknown>).name ??
					(item as unknown as Record<string, unknown>).title ??
					index + 1
			)
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 48);
			let id = explicit ?? `${prefix}-legacy-${label || index + 1}`;
			let suffix = 2;
			while (seen.has(id)) id = `${prefix}-legacy-${label || index + 1}-${suffix++}`;
			seen.add(id);
			return [{ ...item, id }];
		});
	};
	return {
		...draft,
		techChoices: fix(draft.techChoices, 'tech'),
		referenceDocs: fix(draft.referenceDocs, 'reference-doc'),
		constraints: fix(draft.constraints, 'constraint')
	};
}

/* ── Pure selectors ───────────────────────────────────────────────────── */

export function techOfLayer(draft: ProjectArchitectureDraft, layer: ArchLayer): TechChoice[] {
	return draft.techChoices.filter((t) => t.layer === layer);
}

export function layersWithTech(draft: ProjectArchitectureDraft): Set<ArchLayer> {
	return new Set(draft.techChoices.map((t) => t.layer));
}
