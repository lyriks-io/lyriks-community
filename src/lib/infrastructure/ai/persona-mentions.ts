import type { PersonaContextPassage, PersonaSuggestion } from '$application/ports';

type UserClass = PersonaSuggestion['userClass'];

/**
 * A kind of person a product's text may name. `forms` are the spellings to
 * look for (singular and plural, English and French). `qualified` marks the
 * words too vague to stand alone ("owner", "team", "manager"): they only
 * count with the word before them ("restaurant owners", "finance team").
 */
interface PersonTerm {
	name: string;
	userClass: UserClass;
	forms: string[];
	qualified?: true;
}

const TERMS: PersonTerm[] = [
	// end-users
	{ name: 'Customer', userClass: 'end-user', forms: ['customer', 'customers'] },
	{ name: 'Client', userClass: 'end-user', forms: ['client', 'clients'] },
	{ name: 'Buyer', userClass: 'end-user', forms: ['buyer', 'buyers', 'acheteur', 'acheteurs'] },
	{ name: 'Shopper', userClass: 'end-user', forms: ['shopper', 'shoppers'] },
	{ name: 'Consumer', userClass: 'end-user', forms: ['consumer', 'consumers'] },
	{ name: 'Patient', userClass: 'end-user', forms: ['patient', 'patients'] },
	{ name: 'Student', userClass: 'end-user', forms: ['student', 'students', 'étudiant', 'étudiants', 'étudiante', 'étudiantes', 'élève', 'élèves'] },
	{ name: 'Learner', userClass: 'end-user', forms: ['learner', 'learners', 'apprenant', 'apprenants'] },
	{ name: 'Teacher', userClass: 'end-user', forms: ['teacher', 'teachers', 'enseignant', 'enseignants', 'enseignante', 'enseignantes'] },
	{ name: 'Parent', userClass: 'end-user', forms: ['parent', 'parents'] },
	{ name: 'Driver', userClass: 'end-user', forms: ['driver', 'drivers', 'conducteur', 'conducteurs', 'chauffeur', 'chauffeurs'] },
	{ name: 'Courier', userClass: 'end-user', forms: ['courier', 'couriers', 'livreur', 'livreurs'] },
	{ name: 'Rider', userClass: 'end-user', forms: ['rider', 'riders'] },
	{ name: 'Passenger', userClass: 'end-user', forms: ['passenger', 'passengers', 'passager', 'passagers'] },
	{ name: 'Traveler', userClass: 'end-user', forms: ['traveler', 'travelers', 'traveller', 'travellers', 'voyageur', 'voyageurs'] },
	{ name: 'Guest', userClass: 'end-user', forms: ['guest', 'guests'] },
	{ name: 'Tenant', userClass: 'end-user', forms: ['tenant', 'tenants', 'locataire', 'locataires'] },
	{ name: 'Landlord', userClass: 'end-user', forms: ['landlord', 'landlords', 'propriétaire', 'propriétaires'] },
	{ name: 'Member', userClass: 'end-user', forms: ['member', 'members', 'adhérent', 'adhérents', 'adhérente', 'adhérentes'] },
	{ name: 'Subscriber', userClass: 'end-user', forms: ['subscriber', 'subscribers', 'abonné', 'abonnés', 'abonnée', 'abonnées'] },
	{ name: 'Freelancer', userClass: 'end-user', forms: ['freelancer', 'freelancers', 'freelance', 'freelances', 'indépendant', 'indépendants'] },
	{ name: 'Candidate', userClass: 'end-user', forms: ['candidate', 'candidates', 'candidat', 'candidats'] },
	{ name: 'Applicant', userClass: 'end-user', forms: ['applicant', 'applicants'] },
	{ name: 'Citizen', userClass: 'end-user', forms: ['citizen', 'citizens', 'citoyen', 'citoyens'] },
	{ name: 'Player', userClass: 'end-user', forms: ['player', 'players', 'joueur', 'joueurs'] },
	{ name: 'Reader', userClass: 'end-user', forms: ['reader', 'readers', 'lecteur', 'lecteurs'] },
	{ name: 'Seller', userClass: 'end-user', forms: ['seller', 'sellers', 'vendeur', 'vendeurs'] },
	{ name: 'Merchant', userClass: 'end-user', forms: ['merchant', 'merchants', 'commerçant', 'commerçants'] },
	{ name: 'Vendor', userClass: 'end-user', forms: ['vendor', 'vendors'] },
	{ name: 'Supplier', userClass: 'end-user', forms: ['supplier', 'suppliers', 'fournisseur', 'fournisseurs'] },
	{ name: 'Host', userClass: 'end-user', forms: ['host', 'hosts', 'hôte', 'hôtes'] },
	{ name: 'Restaurateur', userClass: 'end-user', forms: ['restaurateur', 'restaurateurs'] },
	{ name: 'Craftsman', userClass: 'end-user', forms: ['craftsman', 'craftsmen', 'artisan', 'artisans'] },
	{ name: 'Farmer', userClass: 'end-user', forms: ['farmer', 'farmers', 'agriculteur', 'agriculteurs'] },
	{ name: 'Doctor', userClass: 'end-user', forms: ['doctor', 'doctors', 'médecin', 'médecins'] },
	{ name: 'Nurse', userClass: 'end-user', forms: ['nurse', 'nurses', 'infirmier', 'infirmiers', 'infirmière', 'infirmières'] },
	{ name: 'Clinician', userClass: 'end-user', forms: ['clinician', 'clinicians'] },
	{ name: 'Lawyer', userClass: 'end-user', forms: ['lawyer', 'lawyers', 'avocat', 'avocats'] },
	{ name: 'Developer', userClass: 'end-user', forms: ['developer', 'developers', 'développeur', 'développeurs'] },
	{ name: 'Employee', userClass: 'end-user', forms: ['employee', 'employees', 'salarié', 'salariés'] },
	{ name: 'Owner', userClass: 'end-user', forms: ['owner', 'owners'], qualified: true },
	{ name: 'User', userClass: 'end-user', forms: ['user', 'users'], qualified: true },
	// back-office
	{ name: 'Administrator', userClass: 'back-office', forms: ['admin', 'admins', 'administrator', 'administrators', 'administrateur', 'administrateurs'] },
	{ name: 'Operator', userClass: 'back-office', forms: ['operator', 'operators', 'opérateur', 'opérateurs'] },
	{ name: 'Moderator', userClass: 'back-office', forms: ['moderator', 'moderators', 'modérateur', 'modérateurs'] },
	{ name: 'Accountant', userClass: 'back-office', forms: ['accountant', 'accountants', 'comptable', 'comptables'] },
	{ name: 'Dispatcher', userClass: 'back-office', forms: ['dispatcher', 'dispatchers', 'répartiteur', 'répartiteurs'] },
	{ name: 'Recruiter', userClass: 'back-office', forms: ['recruiter', 'recruiters', 'recruteur', 'recruteurs'] },
	{ name: 'Auditor', userClass: 'back-office', forms: ['auditor', 'auditors', 'auditeur', 'auditeurs'] },
	{ name: 'Reviewer', userClass: 'back-office', forms: ['reviewer', 'reviewers'] },
	{ name: 'Editor', userClass: 'back-office', forms: ['editor', 'editors', 'éditeur', 'éditeurs'] },
	{ name: 'Account Manager', userClass: 'back-office', forms: ['gestionnaire', 'gestionnaires'] },
	{ name: 'Agent', userClass: 'back-office', forms: ['agent', 'agents'], qualified: true },
	{ name: 'Manager', userClass: 'back-office', forms: ['manager', 'managers'], qualified: true },
	{ name: 'Officer', userClass: 'back-office', forms: ['officer', 'officers'], qualified: true },
	{ name: 'Team', userClass: 'back-office', forms: ['team', 'teams'], qualified: true },
	{ name: 'Staff', userClass: 'back-office', forms: ['staff'], qualified: true }
];

/** Words that cannot qualify a vague person word ("our users", "manage owners"). */
const NOT_QUALIFIERS = new Set(
	`a an the our their your its his her my this that these those some any all many most more few each every
	no not and or but for of to in on at by with from as into via per than then so such other own same new
	is are was were be been being has have had do does did can could will would should may might must
	manage manages managed help helps helped let lets allow allows serve serves need needs want wants
	end internal external main key core primary`.split(/\s+/)
);

const MAX_SUGGESTIONS = 8;
const EXCERPT_LENGTH = 140;

const LETTER = '\\p{L}';
const TERM_PATTERN = new RegExp(
	`(?:([${LETTER}-]+)\\s+)?(?<![${LETTER}])(${TERMS.flatMap((t) => t.forms)
		.sort((a, b) => b.length - a.length)
		.join('|')})(?![${LETTER}])`,
	'giu'
);
const TERM_BY_FORM = new Map(TERMS.flatMap((t) => t.forms.map((f) => [f, t] as const)));

/**
 * The personas a project's own text names, in the order they first appear,
 * each with the passage it was read from. Nothing is invented: a project whose
 * text names nobody gets an empty list (spec criterion `98d98033`). A persona
 * the author typed as free text is offered under a readable name: an identifier
 * such as `site_manager` reads as "Site manager" (criterion `6b26cc3b`).
 */
export function personaMentions(passages: readonly PersonaContextPassage[]): PersonaSuggestion[] {
	const found = new Map<string, PersonaSuggestion>();
	const offer = (s: PersonaSuggestion) => {
		const key = s.name.toLowerCase();
		if (!found.has(key) && found.size < MAX_SUGGESTIONS) found.set(key, s);
	};

	for (const passage of passages) {
		if (passage.where === 'affected persona') {
			const name = readableName(passage.text);
			if (!name) continue;
			const term = mentionsIn(name)[0]?.term;
			offer({
				name,
				rationale: `Typed as an affected persona in the Foundation.`,
				userClass: term?.userClass ?? 'end-user'
			});
			continue;
		}
		for (const sentence of sentencesOf(passage.text)) {
			for (const { name, term } of mentionsIn(sentence)) {
				offer({
					name,
					rationale: `Named in the ${passage.where}: "${excerpt(sentence)}"`,
					userClass: term.userClass
				});
			}
		}
	}
	return [...found.values()];
}

function mentionsIn(text: string): { name: string; term: PersonTerm }[] {
	const out: { name: string; term: PersonTerm }[] = [];
	for (const m of text.matchAll(TERM_PATTERN)) {
		const term = TERM_BY_FORM.get(m[2].toLowerCase());
		if (!term) continue;
		const before = m[1]?.toLowerCase();
		const qualifier = before && before.length > 2 && !NOT_QUALIFIERS.has(before) ? before : null;
		if (term.qualified && !qualifier) continue;
		out.push({ name: term.qualified ? `${titleCase(qualifier!)} ${term.name}` : term.name, term });
	}
	return out;
}

function sentencesOf(text: string): string[] {
	return text
		.split(/(?<=[.!?;])\s+|\n+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function excerpt(sentence: string): string {
	return sentence.length <= EXCERPT_LENGTH ? sentence : `${sentence.slice(0, EXCERPT_LENGTH - 3).trimEnd()}...`;
}

/** `site_manager` -> `Site manager`; a name already written for people keeps its casing. */
function readableName(text: string): string {
	const spaced = text.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function titleCase(word: string): string {
	return word
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('-');
}
