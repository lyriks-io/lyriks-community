import { FORM_FACTOR_GROUPS, MARKET_TYPES, PRODUCT_TYPES, industryLabelOf } from '../foundation';
import type { LexiconRow, RetroItem, RetrospecSpec, SpecCounts } from './reading';
import { clean, label, plural } from './reading-text';

/**
 * The Foundations of the review: the product's identity, its current and target
 * situations, its form factor, who it serves, its scope and its vocabulary,
 * each one only when the specification holds it. Pure.
 */

export function foundationItems(spec: RetrospecSpec, productName: string, counts: SpecCounts): Omit<RetroItem, 'ref'>[] {
	const { identity, definition } = spec.foundation;
	const out: Omit<RetroItem, 'ref'>[] = [];
	const base = { tab: 'foundations' as const, desc: '', rejectable: false };
	const brief = clean(identity.brief);
	out.push({
		...base,
		id: 'fd:identity',
		title: 'Product identity',
		tiles: [
			{ k: 'Product name', v: clean(identity.productName) || productName },
			{ k: 'Market type', v: label(MARKET_TYPES, definition.market.marketType) },
			{ k: 'Industry', v: industryLabelOf(identity.industry) },
			{ k: 'Type', v: label(PRODUCT_TYPES, identity.productType) }
		],
		...(brief ? { lead: { kicker: 'DESCRIPTION', text: brief } } : {})
	});
	const objective = definition.businessObjective;
	const symptoms = [...objective.painPointLinks.map((p) => clean(p.text)), ...objective.painPoints.map(clean)].filter(Boolean);
	if (clean(objective.mainProblem) || symptoms.length > 0) {
		out.push({
			...base,
			id: 'fd:current',
			title: 'Current situation',
			...(clean(objective.mainProblem) ? { lead: { kicker: 'PROBLEM', text: clean(objective.mainProblem) } } : {}),
			...(symptoms.length > 0 ? { symptoms } : {})
		});
	}
	const kpis = objective.kpis.filter((k) => clean(k.name));
	const value = (v: number | null, unit: string) => (v === null ? '' : `${v}${unit ? ` ${unit}` : ''}`);
	const outcomes = [
		...kpis.map((k) => ({ label: clean(k.name), from: value(k.currentValue, clean(k.unit)), to: value(k.targetValue, clean(k.unit)) })),
		...objective.successCriteria.map(clean).filter(Boolean).map((c) => ({ label: c, from: '', to: '' }))
	];
	if (clean(objective.expectedOutcome) || outcomes.length > 0) {
		out.push({
			...base,
			id: 'fd:target',
			title: 'Target situation',
			...(clean(objective.expectedOutcome) ? { lead: { kicker: 'TARGET', text: clean(objective.expectedOutcome) } } : {}),
			...(outcomes.length > 0 ? { outcomes } : {})
		});
	}
	const chosen = new Set<string>(identity.formFactors);
	const formFactors = FORM_FACTOR_GROUPS.map((g) => ({ group: g.label, options: g.items.filter((o) => chosen.has(o.code)).map((o) => o.label) })).filter((g) => g.options.length > 0);
	if (formFactors.length > 0) out.push({ ...base, id: 'fd:form-factor', title: 'Form factor', formFactors });
	const roles = spec.users.roles.filter((r) => clean(r.name));
	if (roles.length > 0) {
		out.push({
			...base,
			id: 'fd:users',
			title: 'Who it serves',
			lead: { kicker: 'USERS', text: `${plural(roles.length, 'user profile')} detected, each with its own permissions.` },
			chips: roles.map((r) => clean(r.name))
		});
	}
	const capabilities = spec.scope.capabilities.filter((c) => clean(c.name) && c.disposition !== 'excluded');
	const figures = [
		counts.features > 0 ? plural(counts.features, 'feature') : '',
		counts.screens > 0 ? plural(counts.screens, 'screen') : '',
		counts.entities > 0 ? plural(counts.entities, 'entity', 'entities') : '',
		capabilities.length > 0 ? plural(capabilities.length, 'capability', 'capabilities') : ''
	].filter(Boolean);
	if (figures.length > 0) {
		out.push({
			...base,
			id: 'fd:scope',
			title: 'Scope',
			...(capabilities.length > 0 ? { lead: { kicker: 'WHAT THE CODE COVERS', text: capabilities.map((c) => clean(c.name)).join(' · ') } } : {}),
			chips: figures
		});
	}
	const lexicon = spec.glossary.terms
		.filter((t) => clean(t.term))
		.map((t): LexiconRow => ({ term: clean(t.term), definition: clean(t.definition), synonyms: t.synonymsAllowed.map(clean).filter(Boolean), banned: t.synonymsAvoid.map(clean).filter(Boolean) }));
	if (lexicon.length > 0) out.push({ ...base, id: 'fd:vocabulary', title: 'Business vocabulary', lexicon });
	return out;
}
