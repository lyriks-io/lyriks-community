import { applyRetrospecAct, closedBeforeFinalCheck, defaultScope, nextRunGathered, resumeOf } from './acts';
import { currentRun, type RetrospecDocument, type RetrospecRun, type RetrospecScope, type RunResume } from './document';
import { retrospecBaseline, type PhaseState } from './progress';
import { analysisOver, relaunchQuestion, runReach, scopeLine, scopeOptions, SCOPE_TITLES, type ScopeOption } from './reverse-page';
import { shortCommit } from './run-history';
import { promptOfRun } from './source-prompt';
import { analysisOf, retrospecStatus, type RetrospecFacts, type RetrospecStatus } from './status';

/**
 * What Mismatch reads of a project's runs (EVO-014): the next run it offers
 * while no run is under way, with the option ticked by default, the question
 * each option asks and the prompt each one hands the AI; and the preview of
 * the run under way, in place of the waiting card. Pure: the facts are read
 * by the caller.
 */

/** What the next run would read and start from. */
export interface NextRunReading {
	readonly doc: RetrospecDocument;
	readonly status: RetrospecStatus;
	/** The revisions of the sections a run writes, as a start records them. */
	readonly baseline: Readonly<Record<string, number>>;
	/** The last run is not validated and its analysis is over: a start closes it (criterion 2dbed801). */
	readonly closesRun: boolean;
	/** The next run starts from a specification already gathered, so it is complementary. */
	readonly gathered: boolean;
	/** Where the last run stopped, when a person closed it before its final check. */
	readonly resumable: RunResume | null;
	/** What it reads unless the person chooses otherwise. */
	readonly scope: RetrospecScope;
}

/**
 * What the next run reads unless the person chooses otherwise, by one rule
 * (rules aac52bf2, 1aee7a97, 81df23c8 of feat-119): Full analysis with nothing
 * gathered, Resume analysis after a run closed before its final check, Delta
 * analysis otherwise; and, for Resume, where that run stopped, phase by phase,
 * as its board reads it.
 */
export function nextRunOf(facts: RetrospecFacts): NextRunReading {
	const status = retrospecStatus(facts);
	const baseline = retrospecBaseline(facts.revisions);
	const last = currentRun(facts.doc);
	const closesRun = analysisOver(status.status) && !!last && !last.publishedAt;
	const gathered = nextRunGathered(facts.doc, baseline, closesRun);
	const resumable = gathered && last && closedBeforeFinalCheck(facts.doc, facts.auditTimes) ? resumeOf(last, analysisOf(facts).progress.phases) : null;
	return { doc: facts.doc, status, baseline, closesRun, gathered, resumable, scope: defaultScope(facts.doc, facts.auditTimes, gathered) };
}

/** A run is under way while it waits for its AI or its AI reads it: Mismatch then shows its preview. */
export const runUnderWay = (status: RetrospecStatus): boolean => status.status === 'source' || status.status === 'running';

/** What one option of the next run asks and hands the AI. */
export interface NextRunChoice extends ScopeOption {
	readonly question: { readonly title: string; readonly message: string };
	/** The prompt the run gets once started on this option, the same its Source step would copy. */
	readonly prompt: string;
}

/** The next analysis Mismatch offers (criterion d44eb4e4). */
export interface NextRunOffer {
	/** The option ticked when the page opens. */
	readonly scope: RetrospecScope;
	readonly choices: readonly NextRunChoice[];
}

const OFFER_ACTOR = { id: 'lyriks', name: 'Lyriks' };

/**
 * The options of the next run, each with its question and its prompt (criteria
 * 04f3bc85, bf0ea80c). The prompt is the one the run gets: the start Run it
 * with my AI sends is applied here in memory, so the two never differ.
 * `choiceNext`: the Source step of Reverse still lets the person choose.
 */
export function nextRunOffer(next: NextRunReading, productName: string, projectId: string, handEdits: number, now: string, choiceNext = false): NextRunOffer {
	const choices = scopeOptions(next.gathered, !!next.resumable).map((option): NextRunChoice => {
		const started = option.unavailable ? null : startedOn(next, option.scope, now);
		const reach = runReach(started?.complementary ? { ...started.complementary, handEdits } : null);
		const fromCommit = started?.complementary?.fromCommit ? shortCommit(started.complementary.fromCommit) : null;
		return {
			...option,
			question: relaunchQuestion(next.gathered ? { complementary: true, fromCommit } : { complementary: false }, next.closesRun, reach, choiceNext),
			prompt: started ? promptOfRun(started, handEdits, productName, projectId) : ''
		};
	});
	return { scope: next.scope, choices };
}

function startedOn(next: NextRunReading, scope: RetrospecScope, now: string): RetrospecRun | null {
	const outcome = applyRetrospecAct(next.doc, { op: 'start', mode: 'repo', baseline: next.baseline, scope, resumable: next.resumable, closesRun: next.closesRun }, { actor: OFFER_ACTOR, now });
	return outcome.ok ? currentRun(outcome.doc) : null;
}

/** Where the preview of a run under way stands (rules 2b888b83, 4e4cf7f2, 2919d935). */
export type PreviewStatus = 'waiting' | 'reading' | 'paused';

/** Waiting until the AI has the run, reading while it calls, paused once it went silent. */
export function previewStatus(status: RetrospecStatus, silent: boolean): PreviewStatus | null {
	if (status.status === 'source') return 'waiting';
	if (status.status === 'running') return silent ? 'paused' : 'reading';
	return null;
}

/** Resume it with my AI: offered on a paused run, to who may write the project (rules 4c60c762, dd19853d; criterion 32e221a6). */
export const resumeOffered = (status: PreviewStatus, canWrite: boolean): boolean => status === 'paused' && canWrite;

/** The head of the preview (criterion 63d6ffe7). */
export function previewHeadline(status: PreviewStatus, phase: string | null): string {
	if (status === 'waiting') return 'Waiting for your AI';
	if (status === 'paused') return 'Paused';
	return phase ? `Reading · ${phase}` : 'Reading';
}

/** What a run already found (criterion 63d6ffe7): a run that holds its changes counts the features re-read and the differences reported. */
export function previewFound(run: RetrospecRun, featuresInSpec: number): { readonly n: number; readonly label: string }[] {
	if (run.holds) {
		const read = run.featuresRead?.length ?? 0;
		const differences = Object.keys(run.report ?? {}).length;
		return [
			{ n: read, label: read === 1 ? 'feature re-read' : 'features re-read' },
			{ n: differences, label: differences === 1 ? 'difference reported' : 'differences reported' }
		];
	}
	// A run that writes as it reads: what the specification holds is what it read.
	return [{ n: featuresInSpec, label: featuresInSpec === 1 ? 'feature read' : 'features read' }];
}

/** The preview of the run under way, as Mismatch shows it in place of the waiting card (criterion 63d6ffe7). */
export interface RunPreview {
	/** waiting or reading; the page reads it paused once the AI went silent. */
	readonly status: Exclude<PreviewStatus, 'paused'>;
	/** Full analysis, Delta analysis or Resume analysis. */
	readonly scopeTitle: string;
	/** The Scope line of Reverse. */
	readonly scope: string;
	readonly phases: readonly { readonly key: string; readonly label: string; readonly state: PhaseState }[];
	readonly pct: number;
	readonly found: readonly { readonly n: number; readonly label: string }[];
}

export function runPreview(facts: RetrospecFacts, status: RetrospecStatus, handEdits: number): RunPreview | null {
	const run = currentRun(facts.doc);
	const shown = previewStatus(status, false);
	if (!run || !shown || shown === 'paused') return null;
	const { progress } = analysisOf(facts);
	const scope = run.complementary?.scope ?? 'whole';
	return {
		status: shown,
		scopeTitle: SCOPE_TITLES[scope],
		scope: scopeLine(run.mode, runReach(run.complementary && { ...run.complementary, handEdits }), !!run.holds),
		phases: progress.phases.map((p) => ({ key: p.key, label: p.label, state: p.state })),
		pct: progress.pct,
		found: previewFound(run, facts.leafFeatureIds?.length ?? 0)
	};
}
