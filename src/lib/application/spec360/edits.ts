import type { ProjectArchitectureDraft } from '$domain/architecture';
import type { ProjectDataDraft } from '$domain/data';
import type { ProjectExperienceDraft } from '$domain/experience';
import { createCore, createFeature, readableName, type ProjectFeaturesDraft } from '$domain/features';
import type { FoundationDefinitionDraft, FoundationIdentityDraft } from '$domain/foundation';
import type { ProjectGlossaryDraft } from '$domain/glossary';
import type { ProductClassification } from './classification';
import { createRole, type ProjectUsersDraft } from '$domain/users';

/**
 * What a person changes on the Specification 360° in place, written into the
 * section that holds it: the element's title, its description and, where the
 * page shows them, its tags (a problem's symptoms, a term's synonyms). Only the
 * elements a section holds as free text are editable here; what the spec
 * derives (journeys of a feature, requirements, health) stays read-only; the
 * product's summary also takes its classification, chosen from the platform's
 * catalogues (classification.ts). Pure.
 */

export type EditSection = 'identity' | 'definition' | 'users' | 'features' | 'experience' | 'architecture' | 'data' | 'glossary' | 'behavior';

/** What the inline editor offers for an element: a title, a description, tags under their label. */
export interface EditShape {
	readonly section: EditSection;
	readonly text: string;
	readonly desc: string | null;
	readonly tags: string | null;
}

const SHAPES: Readonly<Record<string, EditShape>> = {
	product: { section: 'identity', text: 'Summary', desc: null, tags: null },
	problem: { section: 'definition', text: 'Problem', desc: null, tags: 'Symptoms' },
	// The target's results are its KPIs, named; a result typed here is a KPI with no value yet (criterion 416e4885).
	target: { section: 'definition', text: 'Target', desc: null, tags: 'Results' },
	role: { section: 'users', text: 'Name', desc: 'Description', tags: null },
	core: { section: 'features', text: 'Name', desc: 'Description', tags: null },
	feature: { section: 'features', text: 'Name', desc: 'Description', tags: null },
	// An action's name and what it is for live in its feature's behavior model (criterion 701caee5).
	action: { section: 'behavior', text: 'Name', desc: 'What it is for', tags: null },
	journey: { section: 'experience', text: 'Name', desc: 'Description', tags: null },
	component: { section: 'experience', text: 'Name', desc: 'Description', tags: null },
	stack: { section: 'architecture', text: 'Name', desc: 'What it is for', tags: null },
	constraint: { section: 'architecture', text: 'Title', desc: 'Detail', tags: null },
	// A table of the data map, edited in its sheet; the map as a whole is what is validated (validatedElementOf).
	entity: { section: 'data', text: 'Name', desc: 'What it holds', tags: null },
	term: { section: 'glossary', text: 'Term', desc: 'Definition', tags: 'Synonyms' }
};

const kindOf = (anchor: string) => anchor.split(':', 1)[0];
const refOf = (anchor: string) => anchor.split(':').slice(1).join(':');

/** How an element is edited, or null when the page offers no edit for it. */
export function editShapeOf(anchor: string): EditShape | null {
	return SHAPES[kindOf(anchor)] ?? null;
}

export interface ElementEdit {
	readonly text: string;
	readonly desc?: string;
	readonly tags?: readonly string[];
	readonly classification?: ProductClassification;
}

/**
 * The behavior op an action's edit is written with (criterion 701caee5): its name
 * (a blank one keeps the one before, and so does the name as the page read it in
 * words, criterion ac-leaf-ac-tree-readable-actions, since the field starts from
 * that reading) and what it is for. Null when the anchor names no action of a
 * feature. Pure.
 */
export function actionEditOp(anchor: string, surfaceId: string, before: string, edit: ElementEdit): Record<string, unknown> | null {
	const [kind, featureId, actionId] = anchor.split(':');
	if (kind !== 'action' || !featureId || !actionId) return null;
	const name = titled(edit.text, before).trim();
	return {
		kind: 'update_action',
		surfaceId,
		actionId,
		name: name === readableName(before).trim() ? before : name,
		...(edit.desc !== undefined ? { intent: edit.desc.trim() } : {})
	};
}

/** A title is never blank: a cleared one keeps what was there. */
const titled = (value: string, before: string) => value.trim() || before;
const tagsOf = (tags: readonly string[] | undefined) => [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean))];

/** An element's fields as a page shows them. */
export interface ShownFields {
	readonly text: string;
	readonly desc: string;
	readonly tags: readonly string[];
}

/**
 * What an element reads once an edit is saved, by the same rules the section
 * writes apply (a blank title keeps the one before, a description is trimmed,
 * tags are trimmed and kept once): the page shows it the moment Save is clicked.
 */
export function editedFields(read: { readonly text: string; readonly desc?: string; readonly tags?: readonly string[] }, edit: ElementEdit): ShownFields {
	return {
		text: titled(edit.text, read.text).trim(),
		desc: edit.desc === undefined ? (read.desc ?? '') : edit.desc.trim(),
		tags: edit.tags === undefined ? [...(read.tags ?? [])] : tagsOf(edit.tags)
	};
}

export function editIdentity(draft: FoundationIdentityDraft, anchor: string, edit: ElementEdit): FoundationIdentityDraft | null {
	if (kindOf(anchor) !== 'product') return null;
	return { ...draft, brief: titled(edit.text, draft.brief) };
}

export function editDefinition(draft: FoundationDefinitionDraft, anchor: string, edit: ElementEdit): FoundationDefinitionDraft | null {
	const objective = draft.businessObjective;
	if (kindOf(anchor) === 'target') {
		const next = { ...objective, expectedOutcome: titled(edit.text, objective.expectedOutcome) };
		if (edit.tags) {
			// A result kept keeps its values; a result typed here is a KPI named, with no value yet.
			const byName = new Map(objective.kpis.map((k) => [k.name.trim(), k]));
			next.kpis = tagsOf(edit.tags).map((name) => byName.get(name) ?? { name, currentValue: null, targetValue: null, unit: '' });
		}
		return { ...draft, businessObjective: next };
	}
	if (kindOf(anchor) !== 'problem') return null;
	const next = { ...objective, mainProblem: titled(edit.text, objective.mainProblem) };
	if (edit.tags) {
		// The linked pain points keep their links; a symptom typed here is a plain one.
		const wanted = tagsOf(edit.tags);
		next.painPointLinks = objective.painPointLinks.filter((p) => wanted.includes(p.text.trim()));
		const linked = new Set(next.painPointLinks.map((p) => p.text.trim()));
		next.painPoints = wanted.filter((t) => !linked.has(t));
	}
	return { ...draft, businessObjective: next };
}

export function editUsers(draft: ProjectUsersDraft, anchor: string, edit: ElementEdit): ProjectUsersDraft | null {
	if (kindOf(anchor) !== 'role') return null;
	const id = refOf(anchor);
	if (!draft.roles.some((r) => r.id === id)) return null;
	return {
		...draft,
		roles: draft.roles.map((r) => (r.id === id ? { ...r, name: titled(edit.text, r.name), description: edit.desc?.trim() ?? r.description } : r))
	};
}

export function editFeatures(draft: ProjectFeaturesDraft, anchor: string, edit: ElementEdit): ProjectFeaturesDraft | null {
	const id = refOf(anchor);
	if (kindOf(anchor) === 'core' && draft.cores.some((c) => c.id === id)) {
		return { ...draft, cores: draft.cores.map((c) => (c.id === id ? { ...c, name: titled(edit.text, c.name), description: edit.desc?.trim() ?? c.description } : c)) };
	}
	if (kindOf(anchor) === 'feature' && draft.features.some((f) => f.id === id)) {
		return { ...draft, features: draft.features.map((f) => (f.id === id ? { ...f, name: titled(edit.text, f.name), description: edit.desc?.trim() ?? f.description } : f)) };
	}
	return null;
}

export function editExperience(draft: ProjectExperienceDraft, anchor: string, edit: ElementEdit): ProjectExperienceDraft | null {
	const id = refOf(anchor);
	if (kindOf(anchor) === 'journey' && draft.journeys.some((j) => j.id === id)) {
		return { ...draft, journeys: draft.journeys.map((j) => (j.id === id ? { ...j, name: titled(edit.text, j.name), description: edit.desc?.trim() ?? j.description } : j)) };
	}
	if (kindOf(anchor) === 'component' && draft.components.some((c) => c.id === id)) {
		return { ...draft, components: draft.components.map((c) => (c.id === id ? { ...c, name: titled(edit.text, c.name), description: edit.desc?.trim() ?? c.description } : c)) };
	}
	return null;
}

export function editArchitecture(draft: ProjectArchitectureDraft, anchor: string, edit: ElementEdit): ProjectArchitectureDraft | null {
	const id = refOf(anchor);
	if (kindOf(anchor) === 'stack' && draft.techChoices.some((t) => t.id === id)) {
		return { ...draft, techChoices: draft.techChoices.map((t) => (t.id === id ? { ...t, name: titled(edit.text, t.name), role: edit.desc?.trim() ?? t.role } : t)) };
	}
	if (kindOf(anchor) === 'constraint' && draft.constraints.some((c) => c.id === id)) {
		return { ...draft, constraints: draft.constraints.map((c) => (c.id === id ? { ...c, title: titled(edit.text, c.title), detail: edit.desc?.trim() ?? c.detail } : c)) };
	}
	return null;
}

export function editData(draft: ProjectDataDraft, anchor: string, edit: ElementEdit): ProjectDataDraft | null {
	const id = refOf(anchor);
	if (kindOf(anchor) !== 'entity' || !draft.entities.some((e) => e.id === id)) return null;
	return { ...draft, entities: draft.entities.map((e) => (e.id === id ? { ...e, name: titled(edit.text, e.name), description: edit.desc?.trim() ?? e.description } : e)) };
}

/**
 * The element a person validates for what an edit changed: the element itself, or for a table of the data map
 * the map, which is validated as one block. Its last author is who edited it, and the others validate it again.
 */
export function validatedElementOf(anchor: string): string {
	return kindOf(anchor) === 'entity' ? 'datamap' : anchor;
}

export function editGlossary(draft: ProjectGlossaryDraft, anchor: string, edit: ElementEdit): ProjectGlossaryDraft | null {
	const id = refOf(anchor);
	if (kindOf(anchor) !== 'term' || !draft.terms.some((t) => t.id === id)) return null;
	return {
		...draft,
		terms: draft.terms.map((t) =>
			t.id === id
				? { ...t, term: titled(edit.text, t.term), definition: edit.desc?.trim() ?? t.definition, synonymsAllowed: edit.tags ? tagsOf(edit.tags) : t.synonymsAllowed }
				: t
		)
	};
}

/* ── Adding and deleting where the design offers it ───────────────────── */

/** What a user and a core feature added here are named until the reader renames them. */
export const NEW_USER_NAME = 'New user';
export const NEW_CORE_NAME = 'New core feature';
export const NEW_FEATURE_NAME = 'New feature';

/**
 * A list read from A to Z with the element just added at its foot, where its
 * Add was clicked, so it is named there; once its editor closes it takes its
 * alphabetical place (criteria 4b3d2b4d, e356a69c). Pure.
 */
export function addedLast<T>(items: readonly T[], beingNamed: (item: T) => boolean): T[] {
	return [...items.filter((i) => !beingNamed(i)), ...items.filter(beingNamed)];
}

/** An id the page mints for what it adds, so the new element shows before the server answers: a UUID. */
const PROPOSED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when an id the page proposed for a new element is one the spec takes. */
export function isProposedId(value: unknown): value is string {
	return typeof value === 'string' && PROPOSED_ID.test(value);
}

/**
 * A new end user, named so the reader edits it at once; returns the draft and
 * the new element's anchor. `id` is the one the page minted (it shows the new
 * card before the answer); one already in the draft is the same add sent
 * twice, so the draft stays as it is.
 */
export function addUser(draft: ProjectUsersDraft, id?: string): { draft: ProjectUsersDraft; anchor: string } {
	if (id && draft.roles.some((r) => r.id === id)) return { draft, anchor: `role:${id}` };
	const role = createRole({ ...(id ? { id } : {}), name: NEW_USER_NAME, description: '', tone: 'customer' });
	return { draft: { ...draft, roles: [...draft.roles, role] }, anchor: `role:${role.id}` };
}

/** Deleting a user drops the rights it held with it. */
export function deleteUser(draft: ProjectUsersDraft, anchor: string): ProjectUsersDraft | null {
	const id = refOf(anchor);
	if (kindOf(anchor) !== 'role' || !draft.roles.some((r) => r.id === id)) return null;
	return { ...draft, roles: draft.roles.filter((r) => r.id !== id), permissions: draft.permissions.filter((p) => p.roleId !== id) };
}

/** A new core feature, as `addUser` adds a user. */
export function addCore(draft: ProjectFeaturesDraft, id?: string): { draft: ProjectFeaturesDraft; anchor: string } {
	if (id && draft.cores.some((c) => c.id === id)) return { draft, anchor: `core:${id}` };
	const core = createCore({ ...(id ? { id } : {}), name: NEW_CORE_NAME, description: '' });
	return { draft: { ...draft, cores: [...draft.cores, core] }, anchor: `core:${core.id}` };
}

/** A new feature in a core feature (criterion 042ee8c0); null when the core feature is gone. */
export function addFeature(draft: ProjectFeaturesDraft, coreId: string, id?: string): { draft: ProjectFeaturesDraft; anchor: string } | null {
	if (!draft.cores.some((c) => c.id === coreId)) return null;
	if (id && draft.features.some((f) => f.id === id)) return { draft, anchor: `feature:${id}` };
	const feature = createFeature(coreId, null, { ...(id ? { id } : {}), name: NEW_FEATURE_NAME });
	return { draft: { ...draft, features: [...draft.features, feature] }, anchor: `feature:${feature.id}` };
}

/** Why a core feature cannot be deleted from here, or null when it can. */
export function coreDeletionRefusal(draft: ProjectFeaturesDraft, anchor: string): string | null {
	const id = refOf(anchor);
	if (kindOf(anchor) !== 'core' || !draft.cores.some((c) => c.id === id)) return 'This core feature is no longer in the specification.';
	const held = draft.features.filter((f) => f.coreId === id).length + draft.families.filter((f) => f.coreId === id).length;
	return held > 0 ? 'It still holds features: move or delete them first, on the Features page.' : null;
}

export function deleteCore(draft: ProjectFeaturesDraft, anchor: string): ProjectFeaturesDraft | null {
	if (coreDeletionRefusal(draft, anchor)) return null;
	const id = refOf(anchor);
	return { ...draft, cores: draft.cores.filter((c) => c.id !== id) };
}
