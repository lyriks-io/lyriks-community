import {
	coerceBrand,
	createEmptyExperienceDraft,
	emptyPrototype,
	isComponentColor,
	type LibraryComponent,
	type LibraryScreen,
	type ProjectExperienceDraft
} from '$domain/experience';
import type { ExperiencePrototype } from '$domain/experience';
import { parseExperienceBuilder } from './parse-experience-builder';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Step 05 payloads. Same shape as
 * parseFeaturesDraft / parseUsersDraft: merge over defaults, pin projectId.
 * `derivedCores` is intentionally NOT trusted from the client — it is a
 * read-only mirror of Step 04 and is recomputed server-side on load.
 */
export function parseExperienceDraft(input: unknown, projectId: string): ProjectExperienceDraft {
	const base = createEmptyExperienceDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	// Prototype: merge tolerantly over the empty default so a missing/garbled
	// payload never breaks the load.
	const proto = (src.prototype ?? null) as Record<string, unknown> | null;
	const prototype: ExperiencePrototype =
		proto && typeof proto === 'object'
			? {
					screens: parseStableRecords(proto.screens, 'prototype-screen', (record, id) => ({
						...record,
						id
					}) as unknown as ExperiencePrototype['screens'][number]),
					elements: parseStableRecords(proto.elements, 'prototype-element', (record, id) => ({
						...record,
						id
					}) as unknown as ExperiencePrototype['elements'][number]),
					entryScreenId:
						typeof proto.entryScreenId === 'string' ? proto.entryScreenId : null
				}
			: emptyPrototype();

	// Normalize the mockup-parity additions so pre-existing rows (no category /
	// parentScreen / color) load with safe defaults.
	const screens: LibraryScreen[] = parseStableRecords(src.screens, 'screen', (s, id) => ({
		id,
		name: typeof s.name === 'string' ? s.name : '',
		templateId: typeof s.templateId === 'string' ? s.templateId : null,
		description: typeof s.description === 'string' ? s.description : '',
		category: typeof s.category === 'string' ? s.category : null,
		parentScreen: typeof s.parentScreen === 'string' ? s.parentScreen : null,
		path: typeof s.path === 'string' ? s.path : '',
		device: (['auto', 'mobile', 'tablet', 'desktop', 'tv', 'custom'].includes(s.device as string)
			? s.device
			: 'auto') as LibraryScreen['device'],
		deviceW: typeof s.deviceW === 'number' && Number.isFinite(s.deviceW) ? s.deviceW : 1024,
		deviceH: typeof s.deviceH === 'number' && Number.isFinite(s.deviceH) ? s.deviceH : 768
	}));
	const components: LibraryComponent[] = parseStableRecords(src.components, 'component', (c, id) => ({
		id,
		name: typeof c.name === 'string' ? c.name : '',
		description: typeof c.description === 'string' ? c.description : '',
		color: isComponentColor(c.color) ? c.color : 'violet'
	}));
	const records = <T>(value: unknown, prefix: string): T[] =>
		parseStableRecords(value, prefix, (record, id) => ({ ...record, id }) as unknown as T);

	return {
		...base,
		projectId,
		journeys: records(src.journeys, 'journey'),
		steps: records(src.steps, 'journey-step'),
		stepOperations: records(src.stepOperations, 'step-operation'),
		stepDataReads: records(src.stepDataReads, 'step-data-read'),
		templates: records(src.templates, 'template'),
		screens,
		components,
		elements: records(src.elements, 'library-element'),
		derivedCores: [],
		prototype,
		builder: parseExperienceBuilder(src.builder, prototype),
		brand: coerceBrand(src.brand)
	};
}
