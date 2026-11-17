import { kickoffPrompt } from '../foundation/kickoff-prompt';
import type { RetrospecMode, RetrospecScope } from './document';
import { DEFAULT_DOCS_LOCATION, docsRegister, docsWhere, type DocsLocation } from './docs-location';

/**
 * A run that starts from the specification already gathered and reads only the
 * delta: the commit it starts from (null when the last validated run recorded
 * none, or for the documentation), and how many hand edits wait on the code.
 */
export interface ComplementaryPrompt {
	readonly fromCommit: string | null;
	readonly handEdits: number;
	/** What the AI reads: what changed (the default) or the whole product again (criterion 98612117). */
	readonly scope?: RetrospecScope;
	/** The run writes nothing until a person validated it: its AI reports what it finds (criterion 50b00229). */
	readonly held?: boolean;
}

/** A run that reads the code records the commit it read, so the next one reads the delta (criterion c50587fb). */
const RECORD_COMMIT = 'Before finish_project, report the commit you read (the last commit of code of your checkout) with report_retrospec_reading.';
const RECORD_COMMIT_HELD = 'Before you say you are finished, report the commit you read (the last commit of code of your checkout) with report_retrospec_reading.';

/** The AI says it has the prompt before anything else: the page moves on to the analysis without the person (criterion a6f870af). */
const sayReceived = (projectId: string) => `Before anything else, call report_retrospec_reading with project_id ${projectId} and received: true, to tell Lyriks you have this prompt.`;

/**
 * The one prompt a person pastes into their AI to start a retrospecification,
 * for what it should read: the code (the retro-spec playbook ingests and adopts
 * the codebase), the documentation (the build playbook reads the documents it
 * is given), or both, the code staying the reference for what the product does
 * today. Lyriks reads neither itself: the person's AI does, through the MCP.
 * A complementary run reads only what changed since the commit the last
 * validated run read (criteria 8c9bfffe, 23397c95 of feat-mcp-authoring).
 */
export function retrospecPrompt(
	mode: RetrospecMode,
	productName: string,
	projectId: string,
	complementary: ComplementaryPrompt | null = null,
	docsAt: DocsLocation = DEFAULT_DOCS_LOCATION
): string {
	return `${sayReceived(projectId)} ${whatToRead(mode, productName, projectId, complementary, docsAt)}`;
}

function whatToRead(mode: RetrospecMode, productName: string, projectId: string, complementary: ComplementaryPrompt | null, docsAt: DocsLocation): string {
	// A later run starts from what is gathered, whatever it reads (criterion 8c9bfffe of feat-mcp-authoring).
	if (complementary) return complementaryPrompt(mode, productName, projectId, complementary, docsAt);
	// Where the documentation is, and how each document is registered so a citation opens for anyone (criterion b6ad9ca2).
	const docs = `${docsWhere(docsAt)} ${docsRegister(docsAt)}`;
	if (mode === 'docs') return `${kickoffPrompt({ productName, projectId, sourceMode: null, sources: ['documents'] })} ${docs}`;
	const code = `${kickoffPrompt({ productName, projectId, sourceMode: 'code_to_spec' })} ${RECORD_COMMIT}`;
	if (mode === 'repo') return code;
	return `${code} Then read its documentation, even outdated: the code is the reference for what the product does today; where the documentation says otherwise, keep the code’s version and flag the gap as an open question. ${docs}`;
}

const FINAL_CHECK = 'End with the final check: assess_project_completeness, then audit_project_scope, then finish_project once it reports no blocker.';
const END_REPORTING = 'End by calling report_retrospec_reading with finished: true, and stop: a person decides each change on Mismatch.';
const REPORT_FIELDS =
	'id, kind: new | changed | removed, anchor (what it changes or removes: feature:<featureId>, action:<featureId>:<actionId>, rule:<featureId>:<ruleId>, role:<id>, term:<id>, journey:<id>), dock (for a new element, the anchor it docks on), title, proposed (what it would read, in the words of the product), code (what the code reads), where (file:line)';

function complementaryPrompt(mode: RetrospecMode, productName: string, projectId: string, c: ComplementaryPrompt, docsAt: DocsLocation): string {
	const code = readsCode(mode);
	const docs = readsDocs(mode);
	const fromGit = code && c.fromCommit !== null;
	const handEdits = c.handEdits > 0 ? `the ${c.handEdits === 1 ? 'change' : `${c.handEdits} changes`} made by hand in the specification (report_retrospec_reading lists ${c.handEdits === 1 ? 'it' : 'them'})` : null;
	// With a commit, git says what changed; without one, the evidence the specification already cites does, never a second reading of the whole product.
	const reads = [
		fromGit ? `the files \`git diff --name-only ${c.fromCommit}..HEAD\` lists` : null,
		code && !fromGit ? 'the code files whose content differs from the version attached as a source, the cited spans no longer found, and the code no element cites yet' : null,
		docs ? 'the documents whose version or content changed since they were registered in the documents section, and the documents not registered yet (register them)' : null,
		handEdits,
		code ? 'what the enumeration ledger gains or loses on the commit you read' : null
	].filter(Boolean);
	const whole = c.scope === 'whole';
	const what = code && docs ? 'its code and its documentation' : docs ? 'its documentation' : 'its code';
	return [
		`With the Lyriks MCP, run a complementary Reverse-Specification of ${productName} (Lyriks project ${projectId}), following the lyriks-retrospec skill and its section "Complementary run": start from the specification the project already holds and erase nothing.`,
		'First read what it holds: get_project, then each section it names, and the sources and code spans its elements cite.',
		fromGit && !whole ? `The last validated run read commit ${c.fromCommit}.` : null,
		whole
			? `Then read the whole product again, ${what}, as on a first run but element by element against the specification: confirm what still holds without rewording it, complete what is missing and correct what the product now says otherwise${handEdits ? `; read ${handEdits} too` : ''}.`
			: `Then read only the delta: ${reads.join(', ')}.`,
		docs ? `${docsWhere(docsAt)} ${docsRegister(docsAt)}` : null,
		c.held
			? `Write nothing in the specification: Lyriks refuses it until a person validates it on Mismatch and clicks Write the validated changes. Register the sources you read as usual, and report each difference with report_retrospec_reading, changes: [{ ${REPORT_FIELDS} }]. A value a person validated that the product now reads otherwise is reported the same way, and leave out what still holds.`
			: null,
		c.held ? null : 'Write what you find through the section tools: add what is new, update what changed, and leave every other element as it is. Erase nothing: an element whose code or document is gone, and a value a person validated that the product now reads otherwise, are written as findings of the run (rules.issues) for a person to decide.',
		c.handEdits > 0 && code ? 'For each hand edit, report with report_retrospec_reading whether the code says what the specification now says (same) or otherwise (other), with what it reads and where; change neither the edit nor the code.' : null,
		code ? (c.held ? RECORD_COMMIT_HELD : RECORD_COMMIT) : null,
		fromGit && !whole ? `If ${c.fromCommit} is unknown in this checkout, say so and stop: never read the whole product in silence.` : null,
		c.held ? END_REPORTING : FINAL_CHECK
	]
		.filter(Boolean)
		.join(' ');
}

/** What the source step reads, from the two boxes a person ticks: at least one stays ticked. */
export function modeOf(repo: boolean, docs: boolean): RetrospecMode {
	if (repo && docs) return 'both';
	return docs ? 'docs' : 'repo';
}

export const readsCode = (mode: RetrospecMode) => mode !== 'docs';
export const readsDocs = (mode: RetrospecMode) => mode !== 'repo';

/**
 * The prompt that reconnects a person's AI whose retrospecification went
 * silent (ac-leaf-ac-ai-session-disconnected): it resumes the run where it
 * stopped, from what the project already holds, never from the start, so it
 * is right whether the AI wrote anything yet or not.
 */
export function resumeRetrospecPrompt(mode: RetrospecMode, productName: string, projectId: string, docsAt: DocsLocation = DEFAULT_DOCS_LOCATION, held = false): string {
	const what = mode === 'docs' ? 'documentation' : mode === 'both' ? 'code and documentation' : 'code';
	return [
		`With the Lyriks MCP, reconnect to the project ${projectId} and resume the Reverse-Specification of ${productName} where it stopped, following the lyriks-retrospec skill.`,
		`First read what the project already holds (get_project, then each section it names), then finish the phases still open from the ${what}, without rewriting what is already written.`,
		mode !== 'repo' ? docsWhere(docsAt) : null,
		held ? `Write nothing in the specification: keep reporting each difference with report_retrospec_reading, changes: [{ ${REPORT_FIELDS} }].` : null,
		held ? END_REPORTING : FINAL_CHECK
	]
		.filter(Boolean)
		.join(' ');
}
