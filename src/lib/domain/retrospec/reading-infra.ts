import { ARCH_LAYERS } from '../architecture';
import { DB_ENGINES, HOST_KINDS } from '../data';
import { MIGRATION_STRATEGIES } from '../foundation';
import type { RetroItem, RetrospecSpec } from './reading';
import { clean, firstSentence, label, plural } from './reading-text';

/**
 * The Tech and the Infra of the review: the stack layer by layer and its
 * constraints, then where the product runs, its quality targets, how it is
 * delivered and the languages it speaks. Pure.
 */

export function techItems(spec: RetrospecSpec): Omit<RetroItem, 'ref'>[] {
	const out: Omit<RetroItem, 'ref'>[] = [];
	for (const layer of ARCH_LAYERS) {
		const choices = spec.architecture.techChoices.filter((t) => t.layer === layer.code && clean(t.name));
		if (choices.length === 0) continue;
		out.push({
			id: `tech:${layer.code}`,
			tab: 'tech',
			title: layer.label,
			desc: plural(choices.length, 'technology', 'technologies') + '.',
			chips: choices.map((t) => (clean(t.version) ? `${clean(t.name)} ${clean(t.version)}` : clean(t.name))),
			rejectable: false
		});
	}
	const constraints = spec.architecture.constraints.filter((c) => clean(c.title));
	if (constraints.length > 0) out.push({ id: 'tech:constraints', tab: 'tech', title: 'Constraints', desc: `${plural(constraints.length, 'constraint')} the stack must respect.`, chips: constraints.map((c) => clean(c.title)), rejectable: false });
	return out;
}

export function infraItems(spec: RetrospecSpec): Omit<RetroItem, 'ref'>[] {
	const out: Omit<RetroItem, 'ref'>[] = [];
	const base = { tab: 'infra' as const, rejectable: false };
	const { hosts, databases } = spec.data;
	if (hosts.length > 0) {
		out.push({
			...base,
			id: 'infra:hosting',
			title: 'Hosting',
			desc: firstSentence(hosts.map((h) => clean(h.description)).find(Boolean) ?? '') || `${plural(hosts.length, 'host')}.`,
			chips: hosts.map((h) => [clean(h.name), label(HOST_KINDS, h.kind), clean(h.region)].filter(Boolean).join(' · '))
		});
	}
	if (databases.length > 0) {
		out.push({ ...base, id: 'infra:databases', title: 'Databases', desc: `${plural(databases.length, 'database')}.`, chips: databases.map((d) => `${clean(d.name) || d.id} · ${label(DB_ENGINES, d.engine)}`) });
	}
	const q = spec.foundation.operations.quality;
	const targets = [
		clean(q.latencyP95Ms) && `p95 ${clean(q.latencyP95Ms)} ms`,
		clean(q.latencyP99Ms) && `p99 ${clean(q.latencyP99Ms)} ms`,
		clean(q.availabilityPct) && `Availability ${clean(q.availabilityPct)} %`,
		clean(q.errorBudgetPct) && `Error budget ${clean(q.errorBudgetPct)} %`,
		clean(q.ttiMs) && `Interactive in ${clean(q.ttiMs)} ms`,
		clean(q.a11yLevel),
		clean(q.browsers)
	].filter((t): t is string => !!t);
	if (targets.length > 0) out.push({ ...base, id: 'infra:quality', title: 'Quality targets', desc: firstSentence(q.perfNotes) || 'What the product commits to in production.', chips: targets });
	const m = spec.foundation.operations.migration;
	if (m.strategy || clean(m.notes) || clean(m.rollbackPlan)) {
		out.push({
			...base,
			id: 'infra:delivery',
			title: 'Delivery',
			desc: firstSentence(m.notes) || firstSentence(m.rollbackPlan),
			...(m.strategy ? { chips: [label(MIGRATION_STRATEGIES, m.strategy)] } : {})
		});
	}
	const locales = spec.foundation.operations.i18n.locales.map((l) => clean(l.label) || clean(l.code)).filter(Boolean);
	if (locales.length > 0) out.push({ ...base, id: 'infra:languages', title: 'Languages', desc: `${plural(locales.length, 'language')} supported.`, chips: locales });
	return out;
}
