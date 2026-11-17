/** Structural checks for known AST nodes, before normalization can hide missing operands. */
export function behaviorNodeShapeErrors(
	node: Record<string, unknown>,
	path: string,
	grammar: 'expression' | 'condition' | 'goal'
): string[] {
	const errors: string[] = [];
	const required = (key: string, hint = 'a value') => {
		if (!Object.hasOwn(node, key) || node[key] === undefined)
			errors.push(`${path}.${key}: ${String(node.kind)} requires ${hint}.`);
	};
	const text = (key: string) => {
		if (typeof node[key] !== 'string' || !node[key].trim())
			errors.push(`${path}.${key}: ${String(node.kind)} requires a non-empty string.`);
	};
	const object = (key: string) => {
		if (!node[key] || typeof node[key] !== 'object' || Array.isArray(node[key]))
			errors.push(`${path}.${key}: ${String(node.kind)} requires a condition object.`);
	};
	if (grammar === 'condition') {
		if (node.kind === 'all' || node.kind === 'any') {
			if (!Array.isArray(node.conditions)) errors.push(`${path}.conditions: ${node.kind} requires an array of conditions.`);
			else node.conditions.forEach((condition, i) => {
				if (!condition || typeof condition !== 'object' || Array.isArray(condition))
					errors.push(`${path}.conditions[${i}]: expected a condition object.`);
			});
		} else if (node.kind === 'not') object('condition');
		else if (node.kind === 'all_match' || node.kind === 'any_match') {
			text('overPath');
			text('as');
			object('where');
		}
		return errors;
	}
	// Goal patches are partial objects; their conditions are checked by the caller's walk.
	if (grammar !== 'expression') return errors;
	switch (node.kind) {
		case 'literal': required('value'); break;
		case 'state': text('path'); break;
		case 'param':
		case 'const': text('name'); break;
		case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'min': case 'max':
			required('left'); required('right'); break;
		case 'neg': case 'not': case 'sum': case 'count': case 'sum_pluck': case 'count_where':
			required('operand', 'an operand, e.g. {kind:"state",path:"records"}, not a top-level path');
			if (node.kind === 'sum_pluck' || node.kind === 'count_where') text('field');
			if (node.kind === 'count_where') required('equals');
			break;
		case 'switch':
			required('default');
			if (!Array.isArray(node.cases)) errors.push(`${path}.cases: switch requires an array of {when, then} cases.`);
			else node.cases.forEach((entry, i) => {
				const casePath = `${path}.cases[${i}]`;
				if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
					errors.push(`${casePath}: expected a {when, then} case.`);
					return;
				}
				if (!entry.when || typeof entry.when !== 'object' || Array.isArray(entry.when))
					errors.push(`${casePath}.when: switch requires a condition object.`);
				if (!Object.hasOwn(entry, 'then') || entry.then === undefined)
					errors.push(`${casePath}.then: switch requires a result value.`);
			});
	}
	return errors;
}
