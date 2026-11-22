import {
	computeDataCoherence,
	createField,
	descendantFieldIds,
	dataCanAdvance,
	missingDataRequirements,
	type EntityField,
	type FieldType,
	type ProjectDataDraft,
	onDeleteRefusal
} from '$domain/data';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { specLanguageAccessor } from '$ui/language/spec-language-context';
import type { FieldKey } from './board/data-map';

export type { SaveStatus };

/**
 * The data model of a project as the data map reads it (SpecDataMap,
 * ErdCanvas): its coherence and what it still misses, and the few field edits
 * the canvas offers. Every edit goes through `#touch`, so the auth guard and
 * the debounced autosave of feature `c5380392` apply to each.
 */
export class DataStore {
	draft = $state<ProjectDataDraft>(null as unknown as ProjectDataDraft);

	/** The spec's language, from the project it is opened in: its checks read in it. */
	readonly #lang = specLanguageAccessor();
	coherence = $derived.by<CoherenceResult>(() => computeDataCoherence(this.draft, this.#lang()));
	canAdvance = $derived.by<boolean>(() => dataCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingDataRequirements(this.draft));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectDataDraft>;

	constructor(
		initial: ProjectDataDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/data',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
	}

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	hydrate = (incoming: ProjectDataDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────────── FIELDS ────────────────────────────── */
	addField = (entityId: string, overrides: Partial<EntityField> = {}): string => {
		const f = createField(entityId, overrides);
		this.draft.fields.push(f);
		this.#touch('data.fields');
		return f.id;
	};
	updateField = <K extends keyof EntityField>(fieldId: string, field: K, value: EntityField[K]) => {
		const f = this.draft.fields.find((f) => f.id === fieldId);
		if (!f) return;
		(f as unknown as Record<string, unknown>)[field as string] = value;
		// A link made required can no longer be emptied by a deletion (rule 4db09c0c).
		if (f.onDelete && onDeleteRefusal(f, f.onDelete)) delete f.onDelete;
		this.#touch('data.fields');
	};
	setFieldType = (fieldId: string, type: FieldType) => {
		const f = this.draft.fields.find((f) => f.id === fieldId);
		if (!f) return;
		f.type = type;
		if (type !== 'relation') {
			f.relationTargetEntityId = null;
			delete f.onDelete;
		}
		this.#touch('data.fields');
	};
	/**
	 * Say what a field is to its table (feature feat-data-model, "Say what a
	 * field is"). The four keys are exclusive, the way the diagram badges them:
	 * a primary key is never a pointer, and a pointer always names its target,
	 * the first other table when none is given, refused when there is none.
	 */
	setFieldKey = (fieldId: string, key: FieldKey, targetEntityId: string | null = null) => {
		const f = this.draft.fields.find((f) => f.id === fieldId);
		if (!f) return;
		if (key === 'foreign') {
			const target =
				targetEntityId ??
				f.relationTargetEntityId ??
				this.draft.entities.find((e) => e.id !== f.entityId)?.id ??
				null;
			if (!target || !this.draft.entities.some((e) => e.id === target)) {
				this.notifier.notify('warn', 'A pointer needs a table to point at.');
				return;
			}
			f.isId = false;
			f.isUnique = false;
			f.type = 'relation';
			f.relationTargetEntityId = target;
		} else {
			f.isId = key === 'primary';
			f.isUnique = key === 'unique';
			if (f.type === 'relation') {
				f.type = key === 'primary' ? 'uuid' : 'string';
				f.relationTargetEntityId = null;
			}
		}
		this.#touch('data.fields');
	};
	removeField = (fieldId: string) => {
		const removeIds = new Set([fieldId, ...descendantFieldIds(this.draft, fieldId)]);
		this.draft.fields = this.draft.fields.filter((f) => !removeIds.has(f.id));
		this.#touch('data.fields');
	};

	/* ─────────────────────────────── RESET ─────────────────────────────── */
	reset = () => {
		this.draft.entities = [];
		this.draft.fields = [];
		this.draft.interfaces = [];
		this.#touch('data.reset');
	};
}
