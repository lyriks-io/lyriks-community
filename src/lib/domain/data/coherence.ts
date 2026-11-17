import type { CoherenceIssue, CoherenceResult } from '$domain/shared';
import { NBSP, type SpecLanguage } from '$domain/language';
import { sectionTone } from '$domain/coherence/section-tone';
import { fieldsOfEntity, type DataEntity, type ProjectDataDraft } from './draft';

/**
 * The tables nobody points at and that point at nothing: no resolved relation
 * field of their own to ANOTHER entity, and no other entity's relation field
 * aimed at them. A self-relation (a parent of the same kind) and a relation
 * that points nowhere do not connect a table to the rest of the model. An
 * orphan table is a defect, not a starting point: real records belong to
 * something (a line to its invoice, a member to their workspace) or are
 * referenced by something; a model made of orphans describes no product.
 */
export function unrelatedEntities(draft: ProjectDataDraft): DataEntity[] {
	// Tolerant of a partial draft (a loader stub, a legacy row without fields):
	// an absent collection reads as empty, never as a crash in the audit path.
	const entities = draft.entities ?? [];
	// A single table has nothing to relate to: it is alone, not orphaned.
	if (entities.length < 2) return [];
	const entityIds = new Set(entities.map((entity) => entity.id));
	const connected = new Set<string>();
	for (const field of draft.fields ?? []) {
		if (field.type !== 'relation' || !field.relationTargetEntityId) continue;
		const target = field.relationTargetEntityId;
		if (target === field.entityId || !entityIds.has(target) || !entityIds.has(field.entityId)) {
			continue;
		}
		connected.add(field.entityId);
		connected.add(target);
	}
	return entities.filter((entity) => !connected.has(entity.id) && !standsAloneOnPurpose(entity));
}

/** Marked standalone and saying why: a decision, not an orphan. */
const standsAloneOnPurpose = (entity: DataEntity) => entity.standalone === true && entity.description.trim().length > 0;

/**
 * Local-coherence for Step 07. Five concerns — the "no forgotten table, no
 * orphan field" promise, made measurable:
 *   1. Infrastructure exists (>=1 host, >=1 database) .............. 10 pts
 *   2. Entity coverage — every entity the journeys reference exists . 25 pts
 *   3. Every entity has at least one field ......................... 20 pts
 *   4. Every entity is placed on a database ........................ 20 pts
 *   5. Relational integrity: every relation field resolves (15) and
 *      every table takes part in at least one relation (10) ........ 25 pts
 *
 * Score clamped to [0, 100], same convention as Steps 01-06.
 */

export function computeDataCoherence(draft: ProjectDataDraft, lang: SpecLanguage = 'en'): CoherenceResult {
	const fr = lang === 'fr';
	const issues: CoherenceIssue[] = [];
	let score = 0;

	// 1. Infrastructure — 10 pts.
	if (draft.hosts.length > 0 && draft.databases.length > 0) {
		score += 10;
	} else {
		issues.push({
			code: 'no-infra',
			message: fr ? "Aucun hôte ni aucune base de données n'est encore déclaré." : 'No host/database declared yet.'
		});
	}

	const entities = draft.entities;

	// 2. Entity coverage of the derived set — 25 pts (proportional). No forgotten table.
	if (draft.derivedEntities.length > 0) {
		const have = new Set(entities.map((e) => e.name.trim().toLowerCase()));
		const covered = draft.derivedEntities.filter((d) =>
			have.has(d.name.trim().toLowerCase())
		).length;
		score += Math.round(25 * (covered / draft.derivedEntities.length));
		if (covered < draft.derivedEntities.length) {
			issues.push({
				code: 'forgotten-table',
				message: fr
					? `${draft.derivedEntities.length - covered} entité(s) citée(s) par les parcours sans table.`
					: `${draft.derivedEntities.length - covered} entity(ies) referenced by journeys have no table.`
			});
		}
	} else if (entities.length > 0) {
		score += 25; // nothing derived to check against
	}

	if (entities.length > 0) {
		// 3. Every entity has at least one field — 20 pts (proportional).
		const withFields = entities.filter((e) => fieldsOfEntity(draft, e.id).length > 0).length;
		score += Math.round(20 * (withFields / entities.length));
		if (withFields < entities.length) {
			issues.push({
				code: 'fieldless-entity',
				message: fr
					? `${entities.length - withFields} entité(s) sans champ.`
					: `${entities.length - withFields} entity(ies) without a field.`
			});
		}

		// 4. Every entity placed on a database — 20 pts (proportional).
		const placed = entities.filter(
			(e) => e.databaseId && draft.databases.some((d) => d.id === e.databaseId)
		).length;
		score += Math.round(20 * (placed / entities.length));
		if (placed < entities.length) {
			issues.push({
				code: 'unplaced-entity',
				message: fr
					? `${entities.length - placed} entité(s) placée(s) sur aucune base de données.`
					: `${entities.length - placed} entity(ies) not placed on a database.`
			});
		}
	} else {
		issues.push({
			code: 'no-entity',
			message: fr ? "Aucune entité n'est encore modélisée." : 'No entity modeled yet.'
		});
	}

	// 5a. Relational integrity, 15 pts. Every relation field resolves to an entity.
	const relationFields = draft.fields.filter((f) => f.type === 'relation');
	if (relationFields.length > 0) {
		const entityIds = new Set(entities.map((e) => e.id));
		const resolved = relationFields.filter(
			(f) => f.relationTargetEntityId && entityIds.has(f.relationTargetEntityId)
		).length;
		score += Math.round(15 * (resolved / relationFields.length));
		if (resolved < relationFields.length) {
			issues.push({
				code: 'broken-relation',
				message: fr
					? `${relationFields.length - resolved} relation(s) ne pointe(nt) vers rien.`
					: `${relationFields.length - resolved} relation(s) point nowhere.`
			});
		}
	} else if (entities.length > 0) {
		score += 15; // no relations to break
	}

	// 5b. Relational connectivity, 10 pts (proportional). No orphan table: every
	// entity points at another one or is pointed at. Named one by one so the
	// author fixes THESE tables instead of guessing, and reported on every save
	// (the MCP hands `coherenceIssues` back to the writer) so it is caught the
	// moment it appears, not at the final audit.
	if (entities.length > 1) {
		const orphans = unrelatedEntities(draft);
		score += Math.round(10 * ((entities.length - orphans.length) / entities.length));
		if (orphans.length > 0) {
			const shown = orphans.slice(0, 12).map((e) => e.name.trim() || e.id);
			const more = orphans.length - shown.length;
			issues.push({
				code: 'unrelated-entity',
				message: fr
					? `${orphans.length} entité(s) ne participe(nt) à aucune relation${NBSP}: ${shown.join(', ')}` +
						`${more > 0 ? ` et ${more} autres` : ''}. ` +
						`Chaque table se rattache à ce qui la possède ou à ce qu'elle référence${NBSP}; modélisez la relation que le produit a réellement, ou marquez la table isolée (standalone) en disant pourquoi dans sa description.`
					: `${orphans.length} entity(ies) take part in no relation: ${shown.join(', ')}` +
						`${more > 0 ? ` and ${more} more` : ''}. ` +
						'Every table relates to what owns it or to what it references; model the relation the product really has, or mark the table standalone and say in its description why it stands alone.'
			});
		}
	} else if (entities.length === 1) {
		score += 10; // a single table has nothing to relate to
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = sectionTone(clamped, lang);
	return { score: clamped, tone, label, issues };
}
