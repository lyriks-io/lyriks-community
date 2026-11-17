import type { Section } from './sections';

/**
 * Where each section is edited in the app — the capability (and tab) whose
 * label the author actually reads on screen.
 *
 * Public section ids match the current information architecture. Some internal
 * persistence keys predate it, but adapters keep that migration detail behind
 * the single foundation document. Without this map an agent has
 * to GUESS the mapping from a screenshot, and it guesses wrong. Keep it in step
 * with the Specification 360° navigation (`$ui/spec360/spec-nav`) and the app bar (`$ui/shell/app-nav`).
 */
export const UI_LOCATION: Record<Section, string> = {
	scope:
		'Not shown in the interface: the scope ledger is agent-authored and feeds the completion audit (and through it the Project health). Drive it through this API and the completion tools; never tell a user to open a page for it.',
	foundation:
		'Specification 360° › Overview shows and edits the product summary (`identity`: name, summary, classification) and the problem and target (`definition.businessObjective`). ' +
		'Specification 360° › Tech and data › Requirements shows, read-only (change it with patch_section): where it must run (`definition.technical.compatibilities`) · languages and locales (`definition.market.languages` + `operations.i18n`) · ' +
		'security (`definition.security.authentication`, `.authorization`, `.encryption`) · compliance (`definition.market.regulations`, `definition.security.expectedCertifications`) · ' +
		'accessibility (`operations.quality.a11yStandards[]`, picked from a list, several at once) · the technical constraints (`architecture.constraints[]`, the architecture section, the ONE home of every technical constraint). ' +
		'Each requirement records its own sources in `definition.constraints.questionSources.<runtime|languages|security|compliance|accessibility>`. ' +
		'Specification 360° › Tech and data › Operations shows, read-only: availability (`definition.technical.availability`), audit logs (`definition.security.auditLogs`) and the quality targets of `operations.quality` (latencyP95Ms, latencyP99Ms, ttiMs, bundleSizeKb, perfNotes, errorBudgetPct). ' +
		'NOT SHOWN in the interface, so not offered for authoring (stored and served for older readers, never shown, never scored, never ask a person for them, never fill them to raise a score): ' +
		'the constraints that are not technical (`definition.constraints.items`), test fixtures (`operations.testFixtures`), KPIs (`definition.businessObjective.kpis`), the rest of `definition.market`, `definition.competition`, ' +
		'`definition.business.objectives`, `.slas`, `.risks`, `.contractAttachment`; `definition.technical.integrations`, `.apisExpose`, `.apisConsume`, `.performance`; `definition.security.dataRetention`; `operations.migration`.',
	users: 'Specification 360° › Users (roles: name and description, add, delete; one page per user) and Users › Permission matrix (the access ticks)',
	features:
		'Specification 360° › Features: the tree of cores and features (names and descriptions editable, a core added or deleted there) and one page per feature and per action. ' +
		'Releases, sprints and assignments show on Evolutions › Roadmap (written with apply_roadmap_batch). The feature details (`leafMeta`: objective, problem, value, acceptance criteria) are read there, not edited. ' +
		'NOT SHOWN in the interface: the work queue.',
	experience: 'Specification 360° › Experience: the design system (design.md sources), the journeys and their steps, the screen inventory and the components (journey and component names and descriptions editable there)',
	rules:
		'Specification 360° › Overview › What Lyriks noticed shows `issues[]`: each one is a point a person keeps as it is or reopens. ' +
		'NOT SHOWN in the interface, so not offered for authoring: `rules[]`, `inventory[]` and the edge cases (`scenarios[]`). The executable rules the interface shows (Specification 360° › Features, on each action) come from the behavior model: author them with apply_behavior_batch.',
	data: 'Specification 360° › Tech and data › Data map (tables, fields and their links; read and arranged there, not edited) and Tech and data › Operations › Environments (hosts)',
	architecture: 'Specification 360° › Tech and data › Architecture (the stack, editable there) and Tech and data › Requirements (the technical constraints `constraints[]`, editable there)',
	coherence: 'Specification 360° › Overview: the Project health gauge (ONE score) and What Lyriks noticed (every point it is computed from). Derived, read-only.',
	glossary: 'Specification 360° › Glossary (terms editable there)',
	approvals:
		'Not shown in the interface: the approvals the completion audit asks for when a scope item is deferred or a section declared not applicable (a rationale plus an approval files the decision). Written by the agent for that gate only; never tell a user to open a page for it.',
	baselines: 'Not listed in the interface: the versions of the validated Specification 360°, read by its validation. Derived, read-only.',
	documents: 'Specification 360° › Tech and data › Sources (the project evidence register, read-only there), and the sources icon under each cited block',
	evolution:
		'Evolutions › Requests: the board, and one page per request ' +
		'(Specification | Coherence and impact | Implementation quality | Acceptance). ' +
		'The request gathers fields that BELONG to other sections and writes them there; ' +
		'this section stores only the request, its reports, its proposals and its timeline. Evolutions › Roadmap shows the releases and sprints.'
};
