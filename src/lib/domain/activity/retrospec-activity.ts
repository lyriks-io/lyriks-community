import type { RetrospecEvent } from '$domain/retrospec';
import type { ActivityEvent, ActivityKind } from './activity';

/**
 * A retrospecification as activity: a run started and its analysis ready to
 * review (the whole project hears both), its LLM gone silent (the person who
 * started it hears Lyriks say so), the items people validated, rejected (the
 * person who leads the validation hears it), set aside or commented, an item
 * shared with someone (theirs), the specification published. From the Specification 360°: a validator reminded of an element
 * (theirs), the specification validated (the team's).
 */
const KIND: Readonly<Record<RetrospecEvent['kind'], ActivityKind>> = {
	run_started: 'created',
	analysis_finished: 'info',
	item_validated: 'validated',
	item_rejected: 'validated',
	item_set_aside: 'validated',
	item_shared: 'shared',
	comment: 'comment',
	published: 'validated',
	reminder: 'reminder',
	validation_requested: 'reminder',
	revalidation_asked: 'reminder',
	analysis_stopped: 'info'
};

/** The audit names the one operator of an install without accounts `local`. */
const personId = (email: string | undefined) => (!email || email === 'local' ? 'local-operator' : email);

export function retrospecActivity(projectId: string, events: readonly RetrospecEvent[]): ActivityEvent[] {
	return events.map((r) => {
		const base = {
			// Several people are told the same thing at once: each one's event is their own.
			id: `retro:${r.kind}:${r.at}:${r.href}${(r.kind === 'reminder' || r.kind === 'validation_requested' || r.kind === 'revalidation_asked') && r.toEmail ? `:${r.toEmail}` : ''}`,
			projectId,
			at: r.at,
			where: 'Reverse-Specification',
			href: r.href,
			actorName: r.authorName,
			...(r.team ? { team: true } : {}),
			...(r.notice ? { notice: r.notice } : {})
		};
		// The AI's own final check: its person hears that the analysis is ready.
		if (r.kind === 'analysis_finished' && !r.authorName) {
			const owner = personId(r.authorEmail);
			return { ...base, actor: { id: owner, kind: 'ai' as const }, kind: 'ai_done' as const, line: 'finished the Reverse-Specification', text: r.text, to: [owner] };
		}
		// The run's LLM went silent: Lyriks tells the person who started it (criterion fcd8a267).
		if (r.kind === 'analysis_stopped') {
			return { ...base, actor: { id: 'lyriks', kind: 'lyriks' as const }, kind: 'info' as const, line: 'stopped hearing from the AI of the Reverse-Specification', text: r.text, to: r.toEmail ? [r.toEmail] : [] };
		}
		if (r.kind === 'reminder') {
			return { ...base, actor: { id: personId(r.authorEmail), kind: 'person' as const }, kind: 'reminder' as const, line: `reminded ${r.toName ?? 'a colleague'} to validate`, text: r.text, to: r.toEmail ? [r.toEmail] : [], where: 'Specification 360°' };
		}
		if (r.kind === 'validation_requested') {
			return { ...base, actor: { id: personId(r.authorEmail), kind: 'person' as const }, kind: 'reminder' as const, line: `asked ${r.toName ?? 'a colleague'} to validate`, text: r.text, to: r.toEmail ? [r.toEmail] : [], where: 'Specification 360°' };
		}
		if (r.kind === 'revalidation_asked') {
			return { ...base, actor: { id: personId(r.authorEmail), kind: 'person' as const }, kind: 'reminder' as const, line: `asked ${r.toName ?? 'a colleague'} to validate again`, text: r.text, to: r.toEmail ? [r.toEmail] : [], where: 'Specification 360°' };
		}
		if (r.kind === 'published') {
			return {
				...base,
				actor: { id: personId(r.authorEmail), kind: 'person' as const },
				kind: 'validated' as const,
				line: r.text,
				text: 'The Specification 360° is validated. You can now create evolutions.',
				to: r.toEmails ?? [],
				where: 'Specification 360°'
			};
		}
		return {
			...base,
			actor: { id: personId(r.authorEmail), kind: 'person' as const },
			kind: KIND[r.kind],
			line: r.text,
			text: '',
			// A share is told to whom it was shared with; a rejection, to the people its event names (criterion 4fce1259).
			to: r.kind === 'item_shared' && r.toEmail ? [r.toEmail] : r.kind === 'item_rejected' ? (r.toEmails ?? []) : []
		};
	});
}
