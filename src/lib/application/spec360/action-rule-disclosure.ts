/**
 * An action's rules stay folded until the reader opens them (criterion 54bd4e66):
 * no approval, mine or anyone's, and no validated specification opens them.
 * The Edit mode opens them to edit, and a link aimed at one of them opens its action's.
 */
export function actionRulesShown(input: { editing: boolean; targeted: boolean; choice?: boolean }): boolean {
	return input.editing || (input.choice ?? input.targeted);
}
