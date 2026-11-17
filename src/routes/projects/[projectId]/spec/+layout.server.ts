import { timedPart } from '$lib/server/slow-requests.server';
import { RETROSPEC_SECTION } from '$domain/retrospec';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readSpecFrame } from '$lib/server/spec360-read.server';
import { discussionAuthor, discussionRoster } from '$lib/server/spec360-discussions.server';
import { readSpecValidationPage } from '$lib/server/spec360-validation-page.server';
import { sourcesIndex } from '$application/spec360/sources';
import { readSpecSources } from '$lib/server/spec360-sources.server';
import { firstValidatedAt, landedChanges, specNews } from '$application/spec360/spec-news';
import { loadSpecSeen } from '$lib/server/spec-seen.server';
import { callerCanWrite } from '$lib/server/writer-gate.server';
import type { LayoutServerLoad } from './$types';

/**
 * What every page of the Specification 360° shares: the product's name, the
 * feature tree the navigation walks, the latest published baseline, who is
 * reading (the author of what they post) and the colleagues a discussion can
 * notify, and the validation: the elements, who each waits on, where the team
 * stands, and once validated, the code changed outside Lyriks; what each block
 * rests on, the sources of the register it cites (criterion b0ea9889). The discussions
 * themselves load in `+layout.ts`, so a post reloads them alone and never this.
 */
export const load: LayoutServerLoad = async (event) => {
	const { params, depends, cookies } = event;
	depends(sectionSyncKey(params.projectId, 'features'));
	// An evolution going live marks what it wrote (criterion b0950115).
	depends(sectionSyncKey(params.projectId, 'evolution'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	depends(sectionSyncKey(params.projectId, 'baselines'));
	// A validation, a reminder, a code change kept: the review document moves.
	depends(sectionSyncKey(params.projectId, RETROSPEC_SECTION));
	// The elements are read from every section.
	depends(projectSyncKey(params.projectId));
	const services = event.locals.services;
	const frame = readSpecFrame(services, params.projectId);
	const author = discussionAuthor(services, cookies);
	// The validation needs only the product's name and the reader, what this reader opened since only the
	// reader: each starts as soon as they are known, beside the other reads rather than after them all.
	const validationRead = Promise.all([frame, author]).then(([spec, me]) =>
		readSpecValidationPage(services, params.projectId, spec.productName, { id: me.email, name: me.name })
	);
	const seenRead = author.then((me) => loadSpecSeen(services, params.projectId, me.email));
	const [spec, me, roster, canWrite, features, sources, display, evolution, validation, seen] = await Promise.all([
		timedPart('spec:frame', frame),
		timedPart('spec:author', author),
		timedPart('spec:roster', discussionRoster(services, params.projectId, cookies)),
		timedPart('spec:canWrite', callerCanWrite(event)),
		timedPart('spec:features', services.loadFeaturesDraft.execute(params.projectId)),
		// Each block's own sources; who cites a source is read by the Sources page alone.
		timedPart('spec:sources', readSpecSources(services, params.projectId).then(sourcesIndex)),
		services.loadDisplaySettings.execute(),
		timedPart('spec:evolution', services.loadEvolutionDraft.execute(params.projectId).catch(() => null)),
		timedPart('spec:validation', validationRead),
		timedPart('spec:seen', seenRead)
	]);
	const person = { id: me.email, name: me.name };
	// What reads New or Changed, and what this reader opened since (criteria 2a6bff42, b0950115): nothing before
	// the specification's first validation, what a Reverse-Specification wrote being its starting point.
	const news = specNews(features.firstSeenAt, landedChanges(evolution?.requests ?? []), Date.now(), display.newBadgeDays, firstValidatedAt(validation.doc.runs));
	return { spec, me, person, roster, canWrite, validation, sources, news, seen };
};
