/**
 * Requirement sentences read from the behavior model by a fixed template, with
 * no AI: a rule, an always-true statement or a reachability goal reads as one
 * EARS sentence (When / if / then ... shall), a scenario reads as
 * Given / When / Then, in English or French.
 *
 * The template lives in the engine (unspaghettit), which shows the same
 * sentence under each element of its editor: one template for the editor,
 * the rule inventory and the AI clients, so they can never read a rule two
 * ways. Its tests live there too.
 */

export {
	actionContextOf,
	actionPhrase,
	conditionText,
	earsOfEffect,
	earsOfGoal,
	earsOfInvariant,
	earsOfRule,
	eventClause,
	expressionText,
	featureConstants,
	featureLanguage,
	featureProperNames,
	featureStatements,
	gwtOfScenario,
	properNamesIn,
	refusalCase,
	refusalLead,
	statesRead,
	words
} from 'unspaghettit';
export type { ActionContext, Constants } from 'unspaghettit';
