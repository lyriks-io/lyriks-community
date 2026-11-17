import { detectedText, type DetectedFact } from './detected';
import type { RetrospecRun } from './document';

/**
 * The activity log of a run, newest first: who started it, the prompt handed
 * to the person's LLM, the LLM connecting and what it wrote, what Lyriks
 * detected in it by name, its final check. Read from the run, the LLM's calls
 * a node heard on the bus, what that node detected after them, and the audit
 * ledger; nothing is invented between two facts. Pure.
 */

/** One call the person's LLM made on the project, as the bus carried it. */
export interface AiCallFact {
	readonly at: string;
	readonly act: 'read' | 'write';
	/** The section the call read or wrote, when its address named one ('behavior' for a behaviour batch). */
	readonly section: string | null;
	/** The last call of a burst folded into this one, when the tracker folded several. */
	readonly until?: string;
}

/** One pass of the completion gate, as the scope ledger keeps it. */
export interface AuditFact {
	readonly performedAt: string;
	readonly score: number;
	readonly blockingIssues: number;
}

export interface RetrospecLogLine {
	readonly at: string;
	readonly text: string;
	/** `found`: an element Lyriks detected, named. */
	readonly tone: 'normal' | 'warn' | 'ok' | 'found';
}

/** How each section's write reads in the log. */
const WROTE: Readonly<Record<string, string>> = {
	documents: 'gathered its sources',
	scope: 'mapped what the product covers',
	foundation: 'got the gist of the product',
	users: 'met the users and their roles',
	features: 'mapped the features',
	behavior: 'dug into what a feature does',
	data: 'sketched the data model',
	experience: 'walked through the screens',
	rules: 'pinned down the business rules',
	glossary: 'learned the product’s words',
	architecture: 'mapped the tech stack'
};

/** A silence after which a call reads as the LLM coming back, not carrying on. */
export const RECONNECT_MS = 5 * 60_000;
/** Writes of one section within this window of its last line read as that line, whatever came between. */
export const BURST_MS = 60_000;
/** The lines a log keeps: the console shows the last few and unfolds to all of them. */
const KEPT = 300;

export function activityLog(run: RetrospecRun | null, calls: readonly AiCallFact[], audits: readonly AuditFact[], detected: readonly DetectedFact[] = []): RetrospecLogLine[] {
	const since = run && !run.implicit ? run.startedAt : null;
	const out: RetrospecLogLine[] = [];
	if (run && !run.implicit) out.push({ at: run.startedAt, text: `${run.startedBy.name} started the Reverse-Specification`, tone: 'normal' });
	if (run?.launchedAt) out.push({ at: run.launchedAt, text: 'The prompt was handed to your LLM', tone: 'normal' });
	let last: AiCallFact | null = null;
	// Each section's last write: an LLM going back and forth between two sections says each once per burst.
	const lastWrite = new Map<string, number>();
	for (const call of calls) {
		if (since && call.at < since) continue;
		const t = Date.parse(call.at);
		if (!last || t - Date.parse(last.until ?? last.at) > RECONNECT_MS) {
			out.push({ at: call.at, text: last ? 'Your LLM is back on Lyriks' : 'Your LLM plugged into Lyriks through the MCP', tone: 'ok' });
			lastWrite.clear();
		}
		const wrote = call.act === 'write' && call.section ? WROTE[call.section.split('.')[0]] : undefined;
		if (wrote && call.section) {
			const section = call.section.split('.')[0];
			const before = lastWrite.get(section);
			if (before === undefined || t - before > BURST_MS) out.push({ at: call.at, text: `Your LLM ${wrote}`, tone: 'normal' });
			lastWrite.set(section, Date.parse(call.until ?? call.at));
		}
		last = call;
	}
	for (const fact of detected) {
		if (since && fact.at < since) continue;
		out.push({ at: fact.at, text: detectedText(fact), tone: 'found' });
	}
	for (const audit of audits) {
		if (since && audit.performedAt < since) continue;
		const blocked = audit.blockingIssues > 0;
		out.push({
			at: audit.performedAt,
			text: blocked
				? `⚠ Final check: ${audit.blockingIssues} blocking ${audit.blockingIssues === 1 ? 'issue' : 'issues'} left (score ${audit.score})`
				: `Final check passed (score ${audit.score}): the specification is rebuilt`,
			tone: blocked ? 'warn' : 'ok'
		});
	}
	if (run?.analysisEndedAt && run.analysisEndedBy) out.push({ at: run.analysisEndedAt, text: `${run.analysisEndedBy.name} closed the analysis`, tone: 'normal' });
	return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, KEPT);
}
