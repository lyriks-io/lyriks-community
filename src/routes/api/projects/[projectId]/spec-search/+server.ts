import { json } from '@sveltejs/kit';
import { ruleSearchEntries, specSearchEntries } from '$domain/graph/spec-search';
import { recentChanges } from '$domain/features/recent-changes';
import { specOutline } from '$application/spec360/outline';
import { searchRulesOf } from '$application/spec360/search';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { readBehavior } from '$lib/server/behavior-read.server';
import type { RequestHandler } from './$types';

/**
 * What the navigation's search finds in a project, each entry opening its page
 * of the Specification 360°, its rules included, and what it lists while
 * nothing is typed: the core features and features added or changed lately
 * (criterion e11bf80b). Read once by the panel when it first opens on the
 * project, then filtered as the reader types.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	const [graph, glossary, features, behavior] = await Promise.all([
		services.loadKnowledgeGraph.execute(projectId),
		services.loadGlossaryDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		readBehavior(services, projectId)
	]);
	const outline = specOutline(features);
	return json({
		entries: [...specSearchEntries(projectId, graph, glossary.terms), ...ruleSearchEntries(projectId, searchRulesOf(outline, behavior.kernelRules))],
		recent: recentChanges({ cores: outline.cores, firstSeen: features.firstSeenAt, changedAt: behavior.writtenAt })
	});
};
