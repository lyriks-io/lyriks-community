import type { ConsolidatedRule } from '$domain/rules';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import type { ProjectUsersDraft } from '$domain/users';
import type { ProjectExperienceDraft } from '$domain/experience';
import { stepsOfJourney, operationsOfStep } from '$domain/experience';
import { AUTH_MECHANISMS } from '$domain/foundation';

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
 */
export function buildRuleInventory(
	definition: FoundationDefinitionDraft | null,
	users: ProjectUsersDraft | null,
	experience: ProjectExperienceDraft | null
): ConsolidatedRule[] {
	const out: ConsolidatedRule[] = [];

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

	// ── Step 02 · SLAs ──
	definition?.business?.slas?.forEach((s, i) => {
		const metric = asText(s, 'metric');
		if (!metric) return;
		const penalty = prop(s, 'penalty');
		const parts = [prop(s, 'commitment'), penalty ? `penalty: ${penalty}` : ''].filter(Boolean);
		out.push({
			id: `sla-${i}`,
			label: metric,
			category: 'business',
			source: 'sla',
			sourceRefId: `definition.business.slas[${i}]`,
			statement: `${metric}: ${parts.join(', ') || 'committed'}`,
			mandatory: true
		});
	});

	// ── Step 02 · security (authentication + retention) ──
	const authMechs = definition?.security?.authentication ?? [];
	if (authMechs.length > 0) {
		const labels = authMechs.map((c) => AUTH_MECHANISMS.find((m) => m.code === c)?.label ?? c);
		out.push({
			id: 'sec-auth',
			label: 'Authentication',
			category: 'permissions',
			source: 'security',
			sourceRefId: 'definition.security.authentication',
			statement: `Sign-in is via: ${labels.join(', ')}.`,
			mandatory: true
		});
	}
	definition?.security?.dataRetention?.forEach((r, i) => {
		const dt = asText(r, 'dataType');
		if (!dt) return;
		const duration = prop(r, 'duration') || '(unspecified)';
		const actionAfter = prop(r, 'actionAfter') || 'delete';
		out.push({
			id: `ret-${i}`,
			label: `Retention · ${dt}`,
			category: 'validation',
			source: 'security',
			sourceRefId: `definition.security.dataRetention[${i}]`,
			statement: `Keep ${dt} for ${duration}, then ${actionAfter}.`,
			mandatory: true
		});
	});

	// ── Step 03 · permission grants we can name ──
	if (users) {
		const roleName = (id: string) => users.roles.find((r) => r.id === id)?.name || 'A role';
		const capLabel = new Map(users.offStructureCapabilities.map((c) => [c.id, c.label]));
		for (const grant of users.permissions) {
			const label = capLabel.get(grant.capabilityId);
			if (!label) continue; // feature/journey-derived caps aren't persisted here
			const action = grant.action ?? 'access';
			out.push({
				id: `perm-${grant.roleId}-${grant.capabilityId}-${action}`,
				label: `${roleName(grant.roleId)} → ${action} · ${label}`,
				category: 'permissions',
				source: 'permission',
				sourceRefId: grant.capabilityId,
				statement: `${roleName(grant.roleId)} may ${action} ${label.toLowerCase()}.`,
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
				stepNames.length ? `Steps: ${stepNames.join(' → ')}.` : '',
				calls.length ? `Calls: ${calls.join(', ')}.` : ''
			].filter(Boolean);
			out.push({
				id: `jr-${journey.id}`,
				label: journey.name || 'Journey',
				category: 'business',
				source: 'journey',
				sourceRefId: journey.id,
				statement: bits.join(' ') || (journey.name || 'Journey'),
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
