import { architectureStage, type ProjectArchitectureDraft } from '$domain/architecture';
import { sourceAccess, type ProjectDocumentsDraft } from '$domain/documents';
import { NBSP, type SpecLanguage } from '$domain/language';

/**
 * The fixed words of the architecture brief, in the spec's language. Stage,
 * layer, decision and access codes stay as the model stores them; the English
 * texts are the historical ones, byte for byte.
 */
const TEXTS = {
	en: {
		heading: '## Architecture',
		label: (label: string, value: string) => label + ': ' + value,
		stage: 'Stage',
		logical: 'Logical design only: technology selection is not settled.',
		implementation: 'Implementation decisions: use accepted sources; unresolved references need a decision.',
		unnamed: '(unnamed)',
		authoredVersion: 'Authored version',
		noSource: 'No decision source linked.',
		unresolved: 'Unresolved source',
		decision: 'Decision',
		notSpecified: 'not specified',
		access: 'access',
		reference: 'Reference (not fetched)',
		noContent: 'No embedded decision content. Consult the reference before implementing.',
		evidence: 'Reported test evidence (not independently verified)',
		build: 'Build',
		artifact: 'artifact',
		observed: 'Observed',
		provenance: 'provenance',
		command: 'Command',
		criteria: 'Criteria',
		constraint: 'Constraint'
	},
	fr: {
		heading: '## Architecture',
		label: (label: string, value: string) => label + NBSP + ': ' + value,
		stage: 'Étape',
		logical: 'Conception logique uniquement' + NBSP + ': le choix des technologies n’est pas arrêté.',
		implementation:
			'Décisions de mise en œuvre' + NBSP + ': utiliser les sources acceptées' + NBSP + '; les références non résolues attendent une décision.',
		unnamed: '(sans nom)',
		authoredVersion: 'Version indiquée',
		noSource: 'Aucune source de décision liée.',
		unresolved: 'Source introuvable',
		decision: 'Décision',
		notSpecified: 'non précisée',
		access: 'accès',
		reference: 'Référence (non consultée)',
		noContent: 'Aucun contenu de décision intégré. Consultez la référence avant de réaliser.',
		evidence: 'Preuve de test déclarée (non vérifiée de manière indépendante)',
		build: 'Build',
		artifact: 'artefact',
		observed: 'Observé',
		provenance: 'provenance',
		command: 'Commande',
		criteria: 'Critères',
		constraint: 'Contrainte'
	}
} as const;

/** Faithful projection of authored decisions. Never infers a stack or fetches source URLs. */
export function architectureContext(
	architecture: ProjectArchitectureDraft,
	documents: ProjectDocumentsDraft,
	lang: SpecLanguage = 'en'
): string {
	const t = TEXTS[lang];
	const stage = architectureStage(architecture);
	const lines = [t.heading, t.label(t.stage, stage), stage === 'logical' ? t.logical : t.implementation];
	const sourceIds = new Set(architecture.sourceIds);
	for (const component of architecture.techChoices) {
		lines.push(t.label('- [' + component.layer + '] ' + (component.name || t.unnamed), component.role));
		if (component.description) lines.push('  ' + component.description);
		if (component.version) lines.push('  ' + t.label(t.authoredVersion, component.version));
		if (component.referenceDocId) sourceIds.add(component.referenceDocId);
		else lines.push('  ' + t.noSource);
	}
	for (const id of sourceIds) {
		const source = documents.sources.find((row) => row.id === id);
		if (!source) {
			lines.push('### ' + t.label(t.unresolved, id));
			continue;
		}
		lines.push('### ' + (source.title || id) + ' [' + id + ']');
		lines.push(
			t.label(t.decision, source.decision?.status ?? t.notSpecified) +
				(lang === 'fr' ? NBSP : '') +
				'; ' +
				t.label(t.access, sourceAccess(source))
		);
		if (source.url) lines.push(t.label(t.reference, source.url));
		if (source.note) lines.push(source.note);
		if (!source.note) lines.push(t.noContent);
		if (source.evidence) {
			const e = source.evidence;
			const sep = (lang === 'fr' ? NBSP : '') + '; ';
			lines.push(t.label(t.evidence, e.kind + ' / ' + e.result),
				t.label(t.build, e.buildId) + sep + t.label(t.artifact, e.artifact),
				t.label(t.observed, e.observedAt) + sep + t.label(t.provenance, e.provenance),
				t.label(t.command, e.command), t.label(t.criteria, e.criterionIds.join(', ')));
		}
	}
	for (const c of architecture.constraints) lines.push(t.label('- ' + t.label(t.constraint, c.title), c.detail));
	return lines.join('\n');
}
