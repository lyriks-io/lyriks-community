import type { SpecLanguage } from '$domain/language';
import type { LinkKind, LinkMark } from './layout';

/**
 * The words the functional diagram draws, in the language the spec is written
 * in (ac-evo-form-spec-language): its legend, the column of the ways out and
 * their captions, who starts a flow, the guards, the stereotype of a system.
 * The names a person gave stay as they wrote them.
 */
export interface DiagramWords {
	readonly startsLegend: string;
	readonly involvesLegend: string;
	readonly starts: (who: string, useCase: string) => string;
	readonly involves: (useCase: string, who: string) => string;
	readonly waysOut: string;
	readonly refusedWhen: string;
	readonly goesWrongWhen: string;
	readonly startedBy: (who: string) => string;
	readonly guard: Readonly<Record<'else' | 'refused' | 'goes_wrong', string>>;
	readonly system: string;
	readonly component: string;
	readonly store: string;
	readonly isNew: string;
	readonly newLegend: string;
	readonly risks: string;
	readonly goesWrong: string;
	/** What an element is linked to when it bears that thing's own name (ac-evo-uml-legible). */
	readonly existing: Readonly<Record<LinkKind, string>>;
	/** The title of each view, naming what it draws (ac-diag-title); null when the view holds nothing to name yet. */
	readonly titles: {
		readonly useCases: (product: string) => string;
		readonly flow: (useCase: string | null) => string;
		readonly states: (thing: string | null) => string;
		readonly components: string;
		readonly sequence: (name: string | null) => string;
	};
	/** What each field of the diagram shows as its example, in the same language. */
	readonly examples: {
		readonly wayOutWhen: string;
		readonly wayOutThen: string;
		readonly trigger: string;
		readonly linkLabel: string;
		readonly messageText: string;
		readonly failureWhen: string;
		readonly failureThen: string;
	};
}

const WORDS: Readonly<Record<SpecLanguage, DiagramWords>> = {
	en: {
		startsLegend: 'starts the use case',
		involvesLegend: 'the use case involves them',
		starts: (who, useCase) => `${who} starts ${useCase}`,
		involves: (useCase, who) => `${useCase} involves ${who}`,
		waysOut: 'Ways out',
		refusedWhen: 'Refused when',
		goesWrongWhen: 'Goes wrong when',
		startedBy: (who) => `started by ${who}`,
		guard: { else: '[else]', refused: '[refused]', goes_wrong: '[goes wrong]' },
		system: '«system»',
		component: '«component»',
		store: '«store»',
		isNew: 'new',
		newLegend: 'added by the change',
		risks: 'Constraints and risks',
		goesWrong: 'goes wrong',
		existing: { feature: 'existing feature', action: 'existing action', entity: 'existing table' },
		titles: {
			useCases: (product) => `Use cases: who uses ${product || 'the product'}, and for what`,
			flow: (useCase) => (useCase ? `Flow of "${useCase}", step by step` : 'Flows: one per use case, step by step'),
			states: (thing) => (thing ? `States of "${thing}": what it goes through` : 'States: what each thing goes through'),
			components: 'Components: the parts the change involves, and what it adds',
			sequence: (name) => (name ? `Sequence "${name}": who calls whom, in order` : 'Sequences: who calls whom, in order')
		},
		examples: {
			wayOutWhen: 'the order has no phone number',
			wayOutThen: 'Then: the baker sees “no number on file”',
			trigger: 'the customer picks it up',
			linkLabel: 'sends the text over HTTPS',
			messageText: 'asks for a text',
			failureWhen: 'no answer within 10 s',
			failureThen: 'Then: retried every 5 minutes for one hour'
		}
	},
	fr: {
		startsLegend: 'déclenche le cas',
		involvesLegend: 'le cas les fait intervenir',
		starts: (who, useCase) => `${who} déclenche ${useCase}`,
		involves: (useCase, who) => `${useCase} fait intervenir ${who}`,
		waysOut: 'Sorties',
		refusedWhen: 'Refusé quand',
		goesWrongWhen: 'Ça se passe mal quand',
		startedBy: (who) => `lancé par ${who}`,
		guard: { else: '[sinon]', refused: '[refusé]', goes_wrong: '[problème]' },
		system: '«système»',
		component: '«composant»',
		store: '«stockage»',
		isNew: 'nouveau',
		newLegend: 'ajouté par le changement',
		risks: 'Contraintes et risques',
		goesWrong: 'problème',
		existing: { feature: 'fonctionnalité existante', action: 'action existante', entity: 'table existante' },
		titles: {
			useCases: (product) => `Cas d’utilisation\u00a0: qui se sert de ${product || 'ce produit'}, et pour quoi faire`,
			flow: (useCase) => (useCase ? `Déroulé de «\u00a0${useCase}\u00a0», pas à pas` : 'Déroulés\u00a0: un par cas d’utilisation, pas à pas'),
			states: (thing) => (thing ? `États de «\u00a0${thing}\u00a0»\u00a0: ce par quoi il passe` : 'États\u00a0: ce par quoi passe chaque chose'),
			components: 'Composants\u00a0: les parties que le changement met en jeu, et ce qu’il ajoute',
			sequence: (name) => (name ? `Séquence «\u00a0${name}\u00a0»\u00a0: qui appelle qui, dans l’ordre` : 'Séquences\u00a0: qui appelle qui, dans l’ordre')
		},
		examples: {
			wayOutWhen: "la commande n'a pas de numéro de téléphone",
			wayOutThen: 'Ensuite\u00a0: le pâtissier voit «\u00a0pas de numéro enregistré\u00a0»',
			trigger: 'la cliente vient la chercher',
			linkLabel: 'envoie le SMS en HTTPS',
			messageText: "demande l'envoi d'un SMS",
			failureWhen: 'pas de réponse sous 10\u00a0s',
			failureThen: 'Ensuite\u00a0: nouvel essai toutes les 5\u00a0minutes pendant une heure'
		}
	}
};

export const diagramWords = (lang: SpecLanguage): DiagramWords => WORDS[lang] ?? WORDS.en;

/**
 * Names a person gave, in the alphabetical order of the spec's language
 * (ac-evo-func-uml): accents and case never split a letter, and numbers count.
 */
export function alphabetical(names: readonly string[], lang: SpecLanguage): string[] {
	const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
	return [...names].sort(collator.compare);
}

/**
 * The lines a link is drawn on under its element, in the grey of what was there
 * before: the name of what it links to, in full, or only its kind when that
 * name is the element's own, so it is never said twice (ac-evo-uml-legible).
 */
export function linkLabel(mark: LinkMark, words: DiagramWords): string[] {
	if (mark.lines.length === 0) return [`↳ ${words.existing[mark.kind]}`];
	return mark.lines.map((line, i) => (i === 0 ? `↳ ${line}` : line));
}
