import type { ConsolidatedRule } from '$domain/rules';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import { foldGrants, type ProjectUsersDraft } from '$domain/users';
import type { ProjectExperienceDraft } from '$domain/experience';
import { stepsOfJourney, operationsOfStep } from '$domain/experience';
import { AUTH_MECHANISMS } from '$domain/foundation';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/**
 * Consolidates every rule and constraint declared in the earlier steps into the
 * read-only inventory Step 06 triages against. Ids are deterministic (derived
 * from the source) so an Issue's `relatedRuleIds` stay stable across reloads.
 *
 * Sources today:
 *  - the Definition slice — SLAs, authentication & data-retention (the high-level
 *    commitments; detailed business rules are authored directly in Step 06).
 *  - Step 03 Users — the role-by-capability permission grants we can name.
 *  - Step 05 Experience — each journey, with its steps and the calls behind them.
 *
 * Labels and statements are written in the spec's language (`lang`, English
 * when absent); the names they quote from the model stay as they are.
 */
export function buildRuleInventory(
	definition: FoundationDefinitionDraft | null,
	users: ProjectUsersDraft | null,
	experience: ProjectExperienceDraft | null,
	lang: SpecLanguage = 'en'
): ConsolidatedRule[] {
	const out: ConsolidatedRule[] = [];
	const text = inventoryTexts(lang);

	// Tolerant text reader: upstream drafts may carry a structured object
	// ({rule}, {metric}, {dataType}) OR — when authored loosely (e.g. via the
	// MCP) — a bare string. Either way we must never crash the load path, which
	// the whole portfolio + coherence analysis depends on.
	const asText = (v: unknown, key: string): string => {
		if (typeof v === 'string') return v.trim();
		if (v && typeof v === 'object') {
			const x = (v as Record<string, unknown>)[key];
			return typeof x === 'string' ? x.trim() : '';
		}
		return '';
	};
	const prop = (v: unknown, key: string): unknown =>
		v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;

	// Retired from the screen (spec: criterion e8a65d93): stored SLAs no longer surface as rules.
	/*
	// ── Step 02 · SLAs ──
	definition?.business?.slas?.forEach((s, i) => {
		const metric = asText(s, 'metric');
		if (!metric) return;
		const penalty = prop(s, 'penalty');
		const parts = [prop(s, 'commitment'), penalty ? text.penalty(String(penalty)) : ''].filter(Boolean);
		out.push({
			id: `sla-${i}`,
			label: metric,
			category: 'business',
			source: 'sla',
			sourceRefId: `definition.business.slas[${i}]`,
			statement: text.sla(metric, parts.join(', ')),
			mandatory: true
		});
	});
	*/

	// ── Step 02 · security (authentication + retention) ──
	const authMechs = definition?.security?.authentication ?? [];
	if (authMechs.length > 0) {
		const labels = authMechs.map(
			(c) => text.authMechanism(c) ?? AUTH_MECHANISMS.find((m) => m.code === c)?.label ?? c
		);
		out.push({
			id: 'sec-auth',
			label: text.authentication,
			category: 'permissions',
			source: 'security',
			sourceRefId: 'definition.security.authentication',
			statement: text.signIn(labels),
			mandatory: true
		});
	}
	definition?.security?.dataRetention?.forEach((r, i) => {
		const dt = asText(r, 'dataType');
		if (!dt) return;
		const duration = String(prop(r, 'duration') || text.unspecified);
		const actionAfter = String(prop(r, 'actionAfter') || 'delete');
		out.push({
			id: `ret-${i}`,
			label: text.retentionLabel(dt),
			category: 'validation',
			source: 'security',
			sourceRefId: `definition.security.dataRetention[${i}]`,
			statement: text.retention(dt, duration, actionAfter),
			mandatory: true
		});
	});

	// ── Step 03 · permission grants we can name ──
	if (users) {
		const roleName = (id: string) => users.roles.find((r) => r.id === id)?.name || '';
		const capLabel = new Map(users.offStructureCapabilities.map((c) => [c.id, c.label]));
		// One rule per access: a grant carries no verb, it says the role has access.
		for (const grant of foldGrants(users.permissions)) {
			const label = capLabel.get(grant.capabilityId);
			if (!label) continue; // feature/journey-derived caps aren't persisted here
			out.push({
				id: `perm-${grant.roleId}-${grant.capabilityId}-access`,
				label: `${roleName(grant.roleId) || text.aRole} → ${label}`,
				category: 'permissions',
				source: 'permission',
				sourceRefId: grant.capabilityId,
				statement: text.permission(roleName(grant.roleId), label),
				mandatory: true
			});
		}
	}

	// ── Step 05 · journeys (with their steps and calls) ──
	if (experience) {
		for (const journey of experience.journeys) {
			const steps = stepsOfJourney(experience, journey.id);
			const stepNames = steps.map((s) => s.name).filter(Boolean);
			const calls = steps
				.flatMap((s) => operationsOfStep(experience, s.id))
				.map((o) => o.label)
				.filter(Boolean);
			const bits = [
				journey.description?.trim() || '',
				stepNames.length ? text.steps(stepNames) : '',
				calls.length ? text.calls(calls) : ''
			].filter(Boolean);
			out.push({
				id: `jr-${journey.id}`,
				label: journey.name || text.journey,
				category: 'business',
				source: 'journey',
				sourceRefId: journey.id,
				statement: bits.join(' ') || (journey.name || text.journey),
				mandatory: false
			});
		}
	}

	return out;
}

function shortLabel(statement: string): string {
	const trimmed = statement.replace(/\s+/g, ' ').trim();
	return trimmed.length <= 48 ? trimmed : `${trimmed.slice(0, 45)}…`;
}

/**
 * The fixed words of the inventory, in the spec's language. The English texts
 * are the historical ones, byte for byte.
 */
interface InventoryTexts {
	authentication: string;
	unspecified: string;
	aRole: string;
	journey: string;
	penalty(penalty: string): string;
	sla(metric: string, parts: string): string;
	/** A sign-in mechanism as the language names it; null keeps the product's label. */
	authMechanism(code: string): string | null;
	signIn(labels: string[]): string;
	retentionLabel(dataType: string): string;
	retention(dataType: string, duration: string, actionAfter: string): string;
	permission(role: string, capability: string): string;
	steps(names: string[]): string;
	calls(labels: string[]): string;
}

const EN_INVENTORY: InventoryTexts = {
	authentication: 'Authentication',
	unspecified: '(unspecified)',
	aRole: 'A role',
	journey: 'Journey',
	penalty: (penalty) => `penalty: ${penalty}`,
	sla: (metric, parts) => `${metric}: ${parts || 'committed'}`,
	authMechanism: () => null,
	signIn: (labels) => `Sign-in is via: ${labels.join(', ')}.`,
	retentionLabel: (dataType) => `Retention · ${dataType}`,
	retention: (dataType, duration, actionAfter) => `Keep ${dataType} for ${duration}, then ${actionAfter}.`,
	permission: (role, capability) => `${role || 'A role'} has access to ${capability.toLowerCase()}.`,
	steps: (names) => `Steps: ${names.join(' → ')}.`,
	calls: (labels) => `Calls: ${labels.join(', ')}.`
};

const FR_AUTH_MECHANISMS: Readonly<Record<string, string>> = {
	email_password: 'e-mail et mot de passe',
	magic_link: 'lien magique',
	passkey: "clé d'accès"
};

/** What a retention ends with, as a verb after "puis". */
const FR_RETENTION_ACTIONS: Readonly<Record<string, string>> = {
	archival: 'archiver',
	anonymization: 'anonymiser',
	deletion: 'supprimer',
	delete: 'supprimer'
};

const frQuote = (name: string) => quoteName('fr', name);

const FR_INVENTORY: InventoryTexts = {
	authentication: 'Authentification',
	unspecified: '(non précisé)',
	aRole: 'Un rôle',
	journey: 'Parcours',
	penalty: (penalty) => `pénalité${NBSP}: ${penalty}`,
	sla: (metric, parts) => `${metric}${NBSP}: ${parts || 'engagement pris'}`,
	authMechanism: (code) => FR_AUTH_MECHANISMS[code] ?? null,
	signIn: (labels) => `Connexion par${NBSP}: ${labels.join(', ')}.`,
	retentionLabel: (dataType) => `Conservation · ${dataType}`,
	retention: (dataType, duration, actionAfter) =>
		`Conserver ${frQuote(dataType)} pendant ${duration}, puis ${FR_RETENTION_ACTIONS[actionAfter] ?? actionAfter}.`,
	permission: (role, capability) => `${role ? frQuote(role) : 'Un rôle'} a accès à ${frQuote(capability)}.`,
	steps: (names) => `Étapes${NBSP}: ${names.join(' → ')}.`,
	calls: (labels) => `Appels${NBSP}: ${labels.join(', ')}.`
};

const inventoryTexts = (lang: SpecLanguage): InventoryTexts => (lang === 'fr' ? FR_INVENTORY : EN_INVENTORY);
