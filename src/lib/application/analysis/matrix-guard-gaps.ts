import type { Gap } from '$domain/coherence';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';
import { readMatrixAgainstGuards, type ProjectUsersDraft } from '$domain/users';
import type { LeafSnapshot } from '../projection/surface-capabilities';

export const MATRIX_GUARDS_CHECK_ID = 'users.matrix-guards';

const names = (lang: SpecLanguage, list: readonly string[]): string => {
	const quoted = list.map((name) => quoteName(lang, name));
	if (quoted.length < 2) return quoted.join('');
	const and = lang === 'fr' ? ' et ' : ' and ';
	return `${quoted.slice(0, -1).join(', ')}${and}${quoted[quoted.length - 1]}`;
};

/**
 * The points What Lyriks noticed when the access matrix and the guards of the
 * behaviour disagree (criterion 26262450 of feat-access-matrix): one per action
 * whose rules refuse a granted role or let in a role kept out, one per feature
 * whose actions read no role while the matrix keeps roles out, and one when no
 * role says how the behaviour reads it, so nothing could be compared.
 */
export function matrixGuardGaps(
	users: Pick<ProjectUsersDraft, 'roles' | 'permissions'>,
	leaves: readonly LeafSnapshot[],
	lang: SpecLanguage = 'en'
): Gap[] {
	const fr = lang === 'fr';
	const reading = readMatrixAgainstGuards(
		users,
		leaves.map((leaf) => ({ id: leaf.id, name: leaf.name, feature: leaf.snapshot?.feature ?? null }))
	);
	const gaps: Gap[] = [];
	const kindLabel = fr ? 'Matrice et comportement en désaccord' : 'Matrix and behaviour disagree';
	if (!reading.compared) {
		if (!reading.grantsActions || users.roles.length === 0) return gaps;
		gaps.push({
			id: 'gap-users-matrix-unchecked',
			checkId: MATRIX_GUARDS_CHECK_ID,
			kind: 'missing',
			kindLabel: fr ? 'Matrice non comparée' : 'Matrix not compared',
			provenance: 'detected',
			severity: 'low',
			title: fr
				? "La matrice d'accès ne peut pas être comparée au comportement"
				: 'The access matrix cannot be checked against the behaviour',
			detail: fr
				? `Aucun rôle ne dit comment le comportement le lit${NBSP}: rien ne compare qui la matrice laisse entrer avec qui les règles refusent.`
				: 'No role says how the behaviour reads it, so nothing compares who the matrix lets in with who the rules refuse.',
			action: fr
				? `Donnez à chaque rôle ses valeurs dans le comportement, l'état que lisent ses règles (patch_section users, roles[].behaviorValues${NBSP}: [{ path: "session.role", value: "admin" }]).`
				: 'Give each role its values in the behaviour, the state its rules read (patch_section users, roles[].behaviorValues: [{ path: "session.role", value: "admin" }]).',
			sourceStep: 'users',
			blocking: false
		});
		return gaps;
	}
	for (const action of reading.actions) {
		const roles = [...action.refusedButGranted.map((r) => r.roleName), ...action.letInButNotGranted.map((r) => r.roleName)];
		const refused = action.refusedButGranted.map((r) =>
			fr
				? `La matrice l'accorde à ${quoteName(lang, r.roleName)}, mais sa règle ${quoteName(lang, r.rule)} refuse ce rôle.`
				: `The matrix grants it to ${quoteName(lang, r.roleName)}, but its rule ${quoteName(lang, r.rule)} refuses that role.`
		);
		const letIn = action.letInButNotGranted.length
			? [
					fr
						? `La matrice en écarte ${names(lang, action.letInButNotGranted.map((r) => r.roleName))}, mais aucune règle de l'action ne ${action.letInButNotGranted.length > 1 ? 'les' : 'le'} refuse, alors qu'elle lit ce rôle.`
						: `The matrix keeps ${names(lang, action.letInButNotGranted.map((r) => r.roleName))} out, but no rule of the action refuses ${action.letInButNotGranted.length > 1 ? 'them' : 'it'}, although the action reads that role.`
				]
			: [];
		gaps.push({
			id: `gap-users-matrix-guards-${action.featureId}-${action.actionId}`,
			checkId: MATRIX_GUARDS_CHECK_ID,
			kind: 'misalignment',
			kindLabel,
			provenance: 'detected',
			subject: action.actionName,
			severity: 'medium',
			title: fr
				? `${quoteName(lang, action.actionName)} (${action.featureName})${NBSP}: la matrice d'accès et ses règles divergent sur ${names(lang, roles)}`
				: `${quoteName(lang, action.actionName)} (${action.featureName}): the access matrix and its rules disagree on ${names(lang, roles)}`,
			detail: [...refused, ...letIn].join(' '),
			action: fr
				? `Décidez lequel a raison${NBSP}: changez l'accès dans la matrice, ou la règle de l'action dans son comportement.`
				: 'Decide which one is right: change the access in the matrix, or the rule of the action in its behaviour.',
			sourceStep: 'users',
			blocking: false,
			featureRef: action.featureId
		});
	}
	for (const feature of reading.features) {
		const listed = feature.actions.map((a) =>
			fr
				? `${quoteName(lang, a.actionName)} (écarte ${names(lang, a.keptOut)})`
				: `${quoteName(lang, a.actionName)} (keeps out ${names(lang, a.keptOut)})`
		);
		gaps.push({
			id: `gap-users-matrix-blind-${feature.featureId}`,
			checkId: MATRIX_GUARDS_CHECK_ID,
			kind: 'misalignment',
			kindLabel,
			provenance: 'detected',
			subject: feature.featureName,
			severity: 'medium',
			title: fr
				? `${quoteName(lang, feature.featureName)}${NBSP}: aucune règle ne lit de rôle, mais la matrice écarte des rôles de ${feature.actions.length} action${feature.actions.length > 1 ? 's' : ''}`
				: `${quoteName(lang, feature.featureName)}: no rule reads a role, while the matrix keeps roles out of ${feature.actions.length} action${feature.actions.length > 1 ? 's' : ''}`,
			detail: fr
				? `Son comportement laisse entrer tous les rôles${NBSP}: ${listed.join(', ')}.`
				: `Its behaviour lets every role in: ${listed.join(', ')}.`,
			action: fr
				? "Faites lire l'état du rôle aux règles de ces actions (le chemin que nomment les rôles), ou accordez-les à tous les rôles dans la matrice."
				: 'Make the rules of these actions read the role state (the path the roles name), or grant them to every role in the matrix.',
			sourceStep: 'users',
			blocking: false,
			featureRef: feature.featureId
		});
	}
	return gaps;
}
