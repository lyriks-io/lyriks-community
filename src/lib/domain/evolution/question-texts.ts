import type { SpecLanguage } from '$domain/language';
import type { EvolutionStep } from './path';

/**
 * The questions of the steps of prose, in the language the spec is written in
 * (ac-evo-form-spec-language). The English ones stay where they are declared
 * (the need block, STEP_QUESTIONS), since the operations and the AI client
 * read them; this module only says them in another language, keyed like the
 * field each one asks. A language without its texts here reads the English.
 */
export interface QuestionText {
	readonly label: string;
	readonly question: string;
	readonly example: string;
	readonly why: string;
}

const FR: Readonly<Record<string, QuestionText>> = {
	'00-need.description': {
		label: 'Description',
		question: "De quoi s'agit-il, avec vos mots ?",
		example: 'Nos chefs de produit réécrivent la même intention sur chaque feature touchée, et personne ne sait qui a décidé quoi.',
		why: "Tout le reste du besoin se lit à partir d'ici : écrivez-le comme vous le diriez à un collègue."
	},
	'00-need.situation': {
		label: 'Situation actuelle',
		question: "Que se passe-t-il aujourd'hui, et pour qui ?",
		example: 'Chaque demande est écrite dans un document partagé ; les 4 chefs de produit retapent le contexte pour chaque feature touchée.',
		why: "Une situation est un fait qu'un relecteur peut vérifier : c'est ce qui empêche une solution de se faire passer pour un problème."
	},
	'00-need.symptoms': {
		label: 'Symptômes observés',
		question: "Qu'est-ce qui se passe mal, à quelle fréquence, avec un exemple réel ?",
		example: 'Trois des cinq dernières demandes sont parties sans que personne ne sache qui avait validé le périmètre (demandes 41, 44, 46).',
		why: "Un symptôme avec une fréquence et un exemple est une preuve ; sans eux, c'est une impression."
	},
	'00-need.cost': {
		label: 'Ce que ça coûte',
		question: "Combien ça coûte aujourd'hui : temps, erreurs, argent, clients ?",
		example: "Environ 15 heures par semaine de rédaction de spec dans l'équipe, et une reprise par sprint.",
		why: 'Le coût est ce à quoi le changement se mesure quand il faut réduire le périmètre.'
	},
	'00-need.objectives': {
		label: 'Objectifs',
		question: "Qu'est-ce qui doit être vrai une fois le changement livré ?",
		example: "Chaque changement porte une décision traçable par sujet, lisible par l'équipe et par le client.",
		why: "Les objectifs sont ce que l'approbation vérifie sur le changement livré."
	},
	'00-need.measures': {
		label: 'Mesures',
		question: "Qu'est-ce qu'on mesure, sa valeur aujourd'hui et sa cible ? Une par ligne : quoi : aujourd'hui -> cible.",
		example: 'Temps de rédaction des specs : 15 h par semaine -> 3 h par semaine',
		why: "Une cible que personne ne peut mesurer ne se distingue pas de la chance à la revue."
	},
	'step.solution.description': {
		label: 'Avec vos mots',
		question: "Avec vos mots, qu'est-ce qui change dans le produit ?",
		example: 'Envoyer un SMS au client quand son sac est prêt.',
		why: "Tout le reste de l'étape se lit à partir d'ici."
	},
	'step.solution.examples': {
		label: 'Comment on saura que ça marche',
		question: 'Comment saura-t-on que ça marche ? Donnez quelques exemples concrets.',
		example: "Un client dont le sac est prêt reçoit un SMS en moins d'une minute ; un client sans numéro n'en reçoit pas.",
		why: "Les exemples deviennent les critères d'acceptation contre lesquels le code est vérifié."
	},
	'step.solution.out_of_scope': {
		label: 'Ce qui est laissé de côté',
		question: "Qu'est-ce qui reste en dehors de ce changement ?",
		example: "Pas d'e-mail, pas de rappel le lendemain.",
		why: "Dire ce qui n'est pas fait empêche le changement de grossir pendant qu'on le construit."
	},
	'step.functional_spec.description': {
		label: 'Avec vos mots',
		question: "Racontez-le comme la personne qui l'utilise : ce qu'elle fait, ce que le produit lui répond.",
		example: 'Le boulanger marque le sac prêt ; le client reçoit un SMS avec son créneau de retrait.',
		why: "Tout le reste de l'étape se lit à partir d'ici."
	},
	'step.functional_spec.refusals': {
		label: 'Ses règles',
		question: "Qu'est-ce que le produit permet ou refuse, et pourquoi ?",
		example: 'Pas de SMS sans numéro de téléphone : le boulanger voit « aucun numéro enregistré ». Jamais deux SMS pour une même commande.',
		why: 'Les règles sont ce que le code applique et que les tests vérifient.'
	},
	'step.functional_spec.interactions': {
		label: 'Comment la personne agit',
		question: 'Comment la personne agit-elle : sur quoi clique-t-elle, que tape-t-elle, quelle touche presse-t-elle ?',
		example: 'Le boulanger touche « Prêt » sur la commande ; un appui long l’annule pendant dix secondes.',
		why: 'Ce que la personne fait devient les actions des fonctionnalités, et leurs paramètres.'
	},
	'step.functional_spec.screens': {
		label: 'Ce que montre chaque écran',
		question: 'Que montre chaque écran, et où ?',
		example: 'La liste des commandes montre un bouton « Prêt » sur chaque commande non retirée ; l’écran du client montre son créneau.',
		why: "Les écrans de l'Expérience se dessinent à partir d'ici."
	},
	'step.functional_spec.experience': {
		label: 'Ce que la personne ressent',
		question: 'Que doit ressentir ou remarquer la personne : retour, rythme, accessibilité ?',
		example: 'Le boulanger voit aussitôt que le SMS est parti ; rien ne le fait attendre pendant le rush du matin.',
		why: 'Cela dit comment le changement doit se vivre, ce que le design et ses vérifications tiennent.'
	},
	'step.functional_spec.failures': {
		label: 'Quand ça se passe mal',
		question: 'Que se passe-t-il quand quelque chose tourne mal ?',
		example: 'Le fournisseur SMS est en panne : la commande reste prête et le SMS est réessayé pendant une heure.',
		why: "Ce qui casse, c'est ce à quoi personne ne pense avant que ça arrive en production."
	},
	'step.functional_spec.diagram': {
		label: 'Diagramme',
		question: 'Dessinez-le : qui participe, comment se déroule chaque cas et où il peut s’arrêter, par quoi passe chaque chose.',
		example: 'use case Marquer un sac prêt: Boulanger',
		why: "Un dessin montre les trous que la prose cache : une étape que personne ne fait, un refus sans issue, un état dont on ne sort jamais."
	},
	'step.technical_spec.description': {
		label: 'Avec vos mots',
		question: 'Avec vos mots, quelle contrainte ou quel risque technique connaissez-vous ?',
		example: "Les SMS passent par notre fournisseur, 0,05 € l'unité ; jamais plus d'un par commande.",
		why: "Tout le reste de l'étape se lit à partir d'ici."
	},
	'step.technical_spec.diagram': {
		label: 'Diagramme',
		question: 'Dessinez-le : les parties en jeu et ce que le changement ajoute, comment elles échangent, ce qui peut mal tourner.',
		example: 'component SMS sender: new',
		why: 'Un dessin montre ce qu’une décision apporte : une nouvelle dépendance, un nouveau stockage, un appel qui peut échouer.'
	},
	'step.technical_spec.data': {
		label: 'Les données qu’il touche',
		question: 'Quelles données le changement ajoute-t-il, modifie-t-il ou retire-t-il ?',
		example: 'Les commandes ont une date « SMS envoyé le » ; rien n’est retiré.',
		why: "Les tables sont déclarées à partir d'ici à l'analyse d'impact."
	}
};

const PURPOSE_FR: Readonly<Record<EvolutionStep, string>> = {
	need: 'Pourquoi le changement existe, faits à l’appui, avant que quiconque nomme une feature.',
	solution: 'Ce qui change dans le produit et comment on saura que ça marche, avec vos mots. Les features touchées se lisent à l’analyse d’impact.',
	functional_spec:
		'Comment ça se passe pour la personne qui l’utilise et ce que le produit refuse, avec vos mots, puis dessiné en UML. Votre assistant IA peut les traduire en modèle ; ce sont les textes et le diagramme qui font foi.',
	technical_spec: 'Ce que le changement demande à la technique : les contraintes et risques connus, et les données qu’il ajoute, modifie ou retire.',
	impact_analysis:
		'Ce que le changement touche, nommé à partir de ce que vous avez écrit, puis ce qu’il fait au produit : s’il s’emboîte, ce qui bouge et jusqu’où. Personne ne la valide ; en sortir fige une version numérotée sur la demande, et rien ne devient encore officiel.',
	build: 'Ce qui a été construit contre la version figée, ligne par ligne, tiré du code. L’accepter dit que le code correspond ; rien n’est officiel avant que le changement soit déclaré en production.',
	approval: 'Les personnes pour qui il a été construit le parcourent, font leurs remarques et l’approuvent.',
	deployment: 'Déclaré en production par une personne, avec la version qui l’a livré. C’est là que le changement devient officiel, écrit dans la spécification.'
};

/** The words that frame the questions of a step: how they are grouped, and how a step is filled. */
export interface QuestionFrame {
	readonly required: string;
	readonly requiredHint: string;
	readonly optional: string;
	readonly optionalHint: string;
	readonly diagram: string;
	readonly diagramHint: string;
	readonly technicalDiagramHint: string;
	readonly fillTheRest: string;
	readonly answerMyself: (owed: number) => string;
	readonly hideQuestions: string;
	readonly notAnswered: string;
}

const FRAME: Readonly<Record<SpecLanguage, QuestionFrame>> = {
	en: {
		required: 'Required',
		requiredHint: 'answer them, or skip one on purpose',
		optional: 'Optional',
		optionalHint: 'answer them when they help',
		diagram: 'Diagram',
		diagramHint: 'in UML: who takes part, how each use case goes, what each thing goes through',
		technicalDiagramHint: 'in UML: the parts the change involves and adds, how they talk, what can go wrong',
		fillTheRest:
			'Write a few sentences above in your own words: Lyriks reads them and proposes an answer to each question. Or answer the questions yourself.',
		answerMyself: (owed) => (owed > 0 ? `Answer the ${owed} ${owed === 1 ? 'question' : 'questions'} myself` : 'Answer the questions myself'),
		hideQuestions: 'Hide the questions',
		notAnswered: 'Not answered'
	},
	fr: {
		required: 'Obligatoire',
		requiredHint: 'répondez-y, ou passez-en une volontairement',
		optional: 'Facultatif',
		optionalHint: 'répondez-y quand elles aident',
		diagram: 'Diagramme',
		diagramHint: 'en UML : qui participe, comment se déroule chaque cas, par quoi passe chaque chose',
		technicalDiagramHint: 'en UML : les parties en jeu et ce que le changement ajoute, comment elles échangent, ce qui peut casser',
		fillTheRest:
			'Écrivez quelques phrases ci-dessus avec vos mots : votre assistant IA les lit et propose une réponse à chaque question. Ou répondez vous-même aux questions.',
		answerMyself: (owed) => (owed > 0 ? `Répondre moi-même ${owed === 1 ? 'à la question' : `aux ${owed} questions`}` : 'Répondre moi-même aux questions'),
		hideQuestions: 'Masquer les questions',
		notAnswered: 'Sans réponse'
	}
};

/** The question a field asks, said in the spec's language; null where the English it declares is what reads. */
export const questionText = (lang: SpecLanguage, path: string): QuestionText | null => (lang === 'fr' ? (FR[path] ?? null) : null);

/** What a step is for, in the spec's language; null where the English is what reads. */
export const stepPurposeText = (lang: SpecLanguage, step: EvolutionStep): string | null => (lang === 'fr' ? PURPOSE_FR[step] : null);

export const questionFrame = (lang: SpecLanguage): QuestionFrame => FRAME[lang] ?? FRAME.en;
