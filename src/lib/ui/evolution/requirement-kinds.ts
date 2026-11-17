/**
 * How the Solution tab names each text of a step: the section it reads in
 * (2.1 the functional requirements, 2.2 the technical ones) and the kind its
 * lines carry on their chip, in the language of the spec. The thread's
 * suggestion card names its places the same way, so a suggestion reads like
 * the place it would write (ac-evo-live-comment-suggests).
 */
export type RequirementLanguage = 'en' | 'fr';

const KIND: Record<RequirementLanguage, Readonly<Record<string, string>>> = {
	en: {
		'solution.description': 'Change',
		'functional_spec.description': 'Journey',
		'functional_spec.refusals': 'Rule',
		'functional_spec.interactions': 'Interaction',
		'functional_spec.screens': 'Screen',
		'functional_spec.experience': 'Experience',
		'solution.examples': 'Example',
		'functional_spec.failures': 'Failure',
		'solution.out_of_scope': 'Out of scope',
		'technical_spec.description': 'Constraint',
		'technical_spec.data': 'Data'
	},
	fr: {
		'solution.description': 'Changement',
		'functional_spec.description': 'Parcours',
		'functional_spec.refusals': 'Règle',
		'functional_spec.interactions': 'Interaction',
		'functional_spec.screens': 'Écran',
		'functional_spec.experience': 'Expérience',
		'solution.examples': 'Exemple',
		'functional_spec.failures': 'Échec',
		'solution.out_of_scope': 'Hors périmètre',
		'technical_spec.description': 'Contrainte',
		'technical_spec.data': 'Données'
	}
};

/**
 * The order the kinds read in, in their section and in the chip's menu
 * (ac-evo-sol-diagram-alone): the change, then how it goes and what it holds
 * to, then how it is checked and where it stops (src-owner-fr-kinds-20261030).
 */
const ORDER = Object.keys(KIND.en);

/** Where a question's lines read among the kinds of its section; unknown ones last. */
export const requirementOrder = (step: string, key: string): number => {
	const at = ORDER.indexOf(`${step}.${key}`);
	return at < 0 ? ORDER.length : at;
};

export const requirementLanguage = (lang: string | null | undefined): RequirementLanguage => (lang === 'fr' ? 'fr' : 'en');

/** The kind a line of that question carries on its chip, or null when the question has none. */
export const requirementKindOf = (lang: RequirementLanguage, step: string, key: string): string | null => KIND[lang][`${step}.${key}`] ?? null;

/** The section of the Solution tab a step's texts read in. */
export const requirementSectionOf = (step: string): { readonly number: string; readonly title: string } =>
	step === 'technical_spec' ? { number: '2.2', title: 'Technical requirements' } : { number: '2.1', title: 'Functional requirements' };
