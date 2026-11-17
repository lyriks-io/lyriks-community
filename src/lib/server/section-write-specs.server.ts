import { error } from '@sveltejs/kit';
import { assertSummaryFits } from './product-summary.server';
import { sourceAccessIssues } from '$domain/documents';
import { declaredStatePaths, roleValuesOutsideBehavior } from '$domain/users';
import type { DraftableSection } from '$domain/evolution';
import { parseArchitectureDraft } from '$application/specification/parse-architecture-draft';
import { parseDocumentsDraft } from '$application/specification/parse-documents-draft';
import { parseExperienceDraft } from '$application/specification/parse-experience-draft';
import { parseFoundationDraft } from '$application/specification/parse-foundation-draft';
import { parseGlossaryWrite, type GlossaryWrite } from '$application/specification/parse-glossary-draft';
import { parseRulesDraft } from '$application/specification/parse-rules-draft';
import { parseScopeDraft } from '$application/specification/parse-scope-draft';
import { parseUsersWrite, type UsersWrite } from '$application/specification/parse-users-draft';
import { capabilityRegistry, reviewCapabilityReferences, withCarriedGrants } from '$application/specification/capability-registry';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import type { SectionSaveSpec } from '$lib/server/section-save.server';
import type { AppServices } from '$composition/container.server';

/**
 * How each authored section of the spec is written: its guards, its parser and
 * its save. One registry, read by the section's own `PUT /api/draft/<section>`
 * route and by the landing of a request's section changes
 * (ac-evo-draft-section-landing), so a change that lands goes through exactly
 * what its page goes through.
 */

export const FOUNDATION_WRITE = {
	section: 'foundation',
	// The parser folds loose MCP spellings into the canonical draft, so the gate is about ALTITUDE:
	// Foundation is the high-level page, and a feature rule authored into a business field is
	// rejected with the section that owns it.
	validate: async (body, services, projectId) => assertSectionDraftValid('foundation', body, await services.loadSpecLanguage.generated(projectId)),
	parse: parseFoundationDraft,
	persist: async (draft, services, projectId) => {
		await assertSummaryFits(services, projectId, draft.identity.brief);
		return services.saveFoundationDraft.execute(draft);
	}
} satisfies SectionSaveSpec<ReturnType<typeof parseFoundationDraft>, object>;

/** Product scope. Audit and completion metadata are server-owned. */
export const SCOPE_WRITE = {
	section: 'scope',
	parse: parseScopeDraft,
	persist: (draft, services, _projectId, save) => services.saveScopeDraft.execute(draft, save),
	atomic: true,
	mirror: false
} satisfies SectionSaveSpec<ReturnType<typeof parseScopeDraft>, object>;

/**
 * Users. A grant whose capability no longer exists grants nothing to nobody. One
 * the caller INTRODUCES is refused naming the canonical id (ac-matrix-4); one
 * already stored is dead data a rename or a removal left behind, dropped and
 * reported in the answer (ac-matrix-3), since refusing it would wall the section
 * shut (ac-matrix-5). The review sits in `persist` because it is the one step
 * that may both read what is stored and decide what is written. A grant still
 * carrying a verb is accepted, the verb dropped, and the answer's `note` says so
 * (criterion 464a725a of feat-access-matrix).
 */
export const USERS_WRITE = {
	section: 'users',
	validate: (body) => assertSectionDraftValid('users', body),
	parse: parseUsersWrite,
	persist: async ({ draft, ignored }, services, projectId) => {
		const result = await persistUsers(draft, services, projectId);
		return ignored ? { ...result, note: ignored } : result;
	}
} satisfies SectionSaveSpec<UsersWrite, object>;

/**
 * A role value the caller INTRODUCES names a state the behaviour declares, or
 * the write is refused naming it (criterion 8763ca70 of feat-access-matrix).
 * One already stored is kept even when its state has gone since, so the section
 * can always be saved (ac-leaf-ac-matrix-5); the matrix check then reads it as a
 * value no action reads. Read only when a role carries values, so a matrix
 * written without them costs no behaviour read.
 */
async function assertRoleValuesDeclared(draft: UsersWrite['draft'], services: AppServices, projectId: string) {
	if (!draft.roles.some((role) => (role.behaviorValues ?? []).length > 0)) return;
	const [project, stored] = await Promise.all([
		services.behaviorPort.readProject(projectId),
		services.loadUsersDraft.execute(projectId)
	]);
	const snapshots = await Promise.all(
		(project?.project.featureIds ?? []).map((featureId) => services.behaviorPort.readFeature(projectId, featureId))
	);
	const kept = new Set(
		(stored?.roles ?? []).flatMap((role) => (role.behaviorValues ?? []).map((value) => `${role.id}\u0000${value.path}`))
	);
	const introduced = draft.roles.map((role) => ({
		...role,
		behaviorValues: (role.behaviorValues ?? []).filter((value) => !kept.has(`${role.id}\u0000${value.path}`))
	}));
	const issues = roleValuesOutsideBehavior(introduced, declaredStatePaths(snapshots.map((s) => s?.feature ?? null)));
	if (issues.length) error(400, `invalid_role_value: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
}

async function persistUsers(draft: UsersWrite['draft'], services: AppServices, projectId: string) {
	await assertRoleValuesDeclared(draft, services, projectId);
	if (!draft.permissions.length) return services.saveUsersDraft.execute(draft);
	const derived = await services.refreshDerivedCapabilities.execute(projectId);
	// Carried first, on both sides: a grant on a whole feature is a grant on each of its actions now.
	const carried = withCarriedGrants(draft, derived);
	const registry = capabilityRegistry(carried, derived);
	const stored = await services.loadUsersDraft.execute(projectId);
	const review = reviewCapabilityReferences(carried, stored && withCarriedGrants(stored, derived), registry);
	if (review.issues.length) error(400, `invalid_capability_reference: ${review.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
	const result = await services.saveUsersDraft.execute({ ...carried, permissions: review.permissions });
	// Named in the answer, never silent: the matrix heals in the open.
	return review.dropped.length ? { ...result, droppedGrants: review.dropped } : result;
}

/** Experience: journeys and the screens inventory, projected into the canonical local kernel folder. */
export const EXPERIENCE_WRITE = {
	section: 'experience',
	parse: parseExperienceDraft,
	persist: (draft, services) => services.saveExperienceDraft.execute(draft)
} satisfies SectionSaveSpec<ReturnType<typeof parseExperienceDraft>, object>;

/** Rules: the authored issues and edge cases (the inventory is recomputed on load, never trusted from the client). */
export const RULES_WRITE = {
	section: 'rules',
	validate: (body) => assertSectionDraftValid('rules', body),
	parse: parseRulesDraft,
	persist: (draft, services) => services.saveRulesDraft.execute(draft)
} satisfies SectionSaveSpec<ReturnType<typeof parseRulesDraft>, object>;

/**
 * Glossary. A term written without an id is kept under one made from its word,
 * and the answer names each id it gave (`assignedTermIds`), so the author can
 * address the term next time (criterion c7afe419 of feat-fb747-glossary).
 */
export const GLOSSARY_WRITE = {
	section: 'glossary',
	validate: async (body, services, projectId) => assertSectionDraftValid('glossary', body, await services.loadSpecLanguage.generated(projectId)),
	parse: parseGlossaryWrite,
	persist: async ({ draft, assignedTermIds }, services, _projectId, save) => {
		const result = await services.saveGlossaryDraft.execute(draft, save);
		if (result === null || assignedTermIds.length === 0) return result;
		return { ...result, assignedTermIds };
	},
	atomic: true
} satisfies SectionSaveSpec<GlossaryWrite, object>;

/** Architecture: the authored part (the derived mirror is recomputed on load, never trusted from the client). */
export const ARCHITECTURE_WRITE = {
	section: 'architecture',
	parse: parseArchitectureDraft,
	persist: (draft, services, _projectId, save) => services.saveArchitectureDraft.execute(draft, save),
	atomic: true
} satisfies SectionSaveSpec<ReturnType<typeof parseArchitectureDraft>, object>;

/**
 * Documents and sources: the save answers with `coherenceIssues` naming every row
 * a reader other than its author cannot consult, so an agent fixes the row in the
 * same pass instead of finding out at the completion gate.
 */
export const DOCUMENTS_WRITE = {
	section: 'documents',
	parse: parseDocumentsDraft,
	persist: async (draft, services, _projectId, save) => {
		const result = await services.saveDocumentsDraft.execute(draft, save);
		if (result === null) return null;
		const issues = sourceAccessIssues(draft.sources);
		return issues.length === 0 ? result : { ...result, coherenceIssues: issues.slice(0, 20).map((issue) => issue.message) };
	},
	atomic: true,
	mirror: false
} satisfies SectionSaveSpec<ReturnType<typeof parseDocumentsDraft>, object>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWrite = SectionSaveSpec<any, object>;

/** The sections behind the pages a request's section change writes, by their wire id. */
export const SECTION_WRITES: Readonly<Record<DraftableSection, AnyWrite>> = {
	foundation: FOUNDATION_WRITE,
	users: USERS_WRITE,
	experience: EXPERIENCE_WRITE,
	glossary: GLOSSARY_WRITE,
	architecture: ARCHITECTURE_WRITE
};

/** The part as its page reads it (`GET /api/sections`), the document its edits are laid on. */
export async function loadDraftableSection(services: AppServices, section: DraftableSection, projectId: string): Promise<unknown> {
	switch (section) {
		case 'foundation':
			return services.loadFoundationDraft.execute(projectId);
		case 'users':
			return services.loadUsersDraft.execute(projectId);
		case 'experience':
			return services.loadExperienceDraft.execute(projectId);
		case 'glossary':
			return services.loadGlossaryDraft.execute(projectId);
		case 'architecture':
			return services.loadArchitectureDraft.execute(projectId);
	}
}
