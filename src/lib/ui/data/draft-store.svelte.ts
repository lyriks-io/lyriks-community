import {
	computeDataCoherence,
	createDatabase,
	createEntity,
	createField,
	descendantFieldIds,
	createHost,
	createInterface,
	dataCanAdvance,
	missingDataRequirements,
	type Database,
	type DataEntity,
	type DataVisibilityChoice,
	type EntityField,
	type FieldType,
	type Host,
	type Interface,
	type ProjectDataDraft
} from '$domain/data';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Step 07 store — orchestrator for the Data & Flows screen. Mirror of the
 * Step 02-06 stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `c5380392` is honored uniformly. "Derive" runs
 * client-side over the loaded derivedEntities; "Refresh derived" re-pulls them.
 */
export class DataStore {
	draft = $state<ProjectDataDraft>(null as unknown as ProjectDataDraft);

	coherence = $derived.by<CoherenceResult>(() => computeDataCoherence(this.draft));
	canAdvance = $derived.by<boolean>(() => dataCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingDataRequirements(this.draft));

	/** Derived entity names still missing a real table — the "forgotten tables". */
	missingTables = $derived.by<string[]>(() => {
		const have = new Set(this.draft.entities.map((e) => e.name.trim().toLowerCase()));
		return this.draft.derivedEntities
			.filter((d) => !have.has(d.name.trim().toLowerCase()))
			.map((d) => d.name);
	});

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

	/* ─────────────────── CLIENT VISIBILITY (override) ──────────────────── */
	/** The user's explicit visibility choice for an entity/field, or null when
	 * none is set (⇒ follow the derived experience visibility). */
	getVisibilityChoice = (id: string): DataVisibilityChoice | null =>
		this.draft.visibility?.[id] ?? null;

	/** Force a data shown/hidden on the client experience, or clear the override
	 * (null → back to following the experience). Deletes the key when cleared so
	 * the residue stays clean. */
	setVisibilityChoice = (id: string, choice: DataVisibilityChoice | null) => {
		if (choice === null) {
			if (this.draft.visibility && id in this.draft.visibility) {
				delete this.draft.visibility[id];
				this.#touch('data.visibility');
			}
			return;
		}
		if (!this.draft.visibility) this.draft.visibility = {};
		this.draft.visibility[id] = choice;
		this.#touch('data.visibility');
	};

	/* ─────────────────────────────── HOSTS ─────────────────────────────── */
	/** A host's name for a notification (never blank). */
	#hostName = (hostId: string): string =>
		this.draft.hosts.find((h) => h.id === hostId)?.name?.trim() || 'the host';

	addHost = (overrides: Partial<Host> = {}): string => {
		const h = createHost(overrides);
		this.draft.hosts.push(h);
		this.#touch('data.hosts');
		// Born unnamed from the "+" button: the new card is right there, nothing to say.
		if (h.name.trim()) this.notifier.notify('info', `Host "${h.name}" added.`);
		return h.id;
	};
	updateHost = <K extends keyof Host>(hostId: string, field: K, value: Host[K]) => {
		const h = this.draft.hosts.find((h) => h.id === hostId);
		if (!h) return;
		(h as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('data.hosts');
	};
	removeHost = (hostId: string) => {
		this.draft.hosts = this.draft.hosts.filter((h) => h.id !== hostId);
		// Unplace databases on this host, then unplace entities on those databases.
		const orphanDbs = new Set(
			this.draft.databases.filter((d) => d.hostId === hostId).map((d) => d.id)
		);
		this.draft.databases = this.draft.databases.filter((d) => d.hostId !== hostId);
		for (const e of this.draft.entities)
			if (e.databaseId && orphanDbs.has(e.databaseId)) e.databaseId = null;
		this.#touch('data.hosts');
	};

	/* ───────────────────────────── DATABASES ───────────────────────────── */
	addDatabase = (hostId: string, overrides: Partial<Database> = {}): string => {
		const d = createDatabase(hostId, overrides);
		this.draft.databases.push(d);
		this.#touch('data.databases');
		if (d.name.trim()) {
			this.notifier.notify('info', `Database "${d.name}" added on ${this.#hostName(hostId)}.`);
		}
		return d.id;
	};
	updateDatabase = <K extends keyof Database>(databaseId: string, field: K, value: Database[K]) => {
		const d = this.draft.databases.find((d) => d.id === databaseId);
		if (!d) return;
		(d as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('data.databases');
	};
	removeDatabase = (databaseId: string) => {
		this.draft.databases = this.draft.databases.filter((d) => d.id !== databaseId);
		for (const e of this.draft.entities) if (e.databaseId === databaseId) e.databaseId = null;
		this.#touch('data.databases');
	};
	/** Relocate a database (and its tables, which travel with it) to another host — the mockup's drag-and-drop. */
	moveDatabaseToHost = (databaseId: string, hostId: string) => {
		const d = this.draft.databases.find((d) => d.id === databaseId);
		if (!d || d.hostId === hostId) return;
		d.hostId = hostId;
		this.#touch('data.databases');
		this.notifier.notify(
			'info',
			`Database "${d.name || 'Untitled database'}" moved to ${this.#hostName(hostId)}; its tables travel with it.`
		);
	};

	/**
	 * Return a database id on `hostId`, creating a default "Primary" one if the
	 * host has none. Lets the Infrastructure card work entity-first (the mockup's
	 * model) while v3 keeps its Host → Database → Entity normalization. Does not
	 * `#touch` on its own — the caller that mutates an entity does.
	 */
	#ensureHostDatabase = (hostId: string): string => {
		const existing = this.draft.databases.find((d) => d.hostId === hostId);
		if (existing) return existing.id;
		const d = createDatabase(hostId, { name: 'Primary' });
		this.draft.databases.push(d);
		return d.id;
	};

	/** Create a new entity placed directly on a host (the mockup's "create entity"). */
	createEntityOnHost = (hostId: string, name = ''): string => {
		const databaseId = this.#ensureHostDatabase(hostId);
		const e = createEntity({ name, databaseId });
		this.draft.entities.push(e);
		this.#touch('data.entities');
		this.notifier.notify(
			'info',
			name.trim()
				? `Entity "${name}" created on ${this.#hostName(hostId)}.`
				: `New entity placed on ${this.#hostName(hostId)}.`
		);
		return e.id;
	};

	/** Attach an existing (typically unplaced) entity to a host (the mockup's "attach entity"). */
	attachEntityToHost = (hostId: string, entityId: string) => {
		const e = this.draft.entities.find((x) => x.id === entityId);
		if (!e) return;
		e.databaseId = this.#ensureHostDatabase(hostId);
		this.#touch('data.entities');
	};

	/** Relocate an entity to another host — what dragging an entity card does. */
	moveEntityToHost = (entityId: string, hostId: string) => {
		const e = this.draft.entities.find((x) => x.id === entityId);
		if (!e) return;
		const target = this.#ensureHostDatabase(hostId);
		if (e.databaseId === target) return;
		e.databaseId = target;
		this.#touch('data.entities');
		this.notifier.notify(
			'info',
			`Entity "${e.name || 'Untitled entity'}" moved to ${this.#hostName(hostId)}.`
		);
	};

	/** Remove an entity from its host (unplace it; the table itself is kept). */
	detachEntity = (entityId: string) => {
		const e = this.draft.entities.find((x) => x.id === entityId);
		if (!e || e.databaseId === null) return;
		e.databaseId = null;
		this.#touch('data.entities');
	};

	/* ────────────────────────────── ENTITIES ───────────────────────────── */
	addEntity = (overrides: Partial<DataEntity> = {}): string => {
		const e = createEntity(overrides);
		this.draft.entities.push(e);
		this.#touch('data.entities');
		if (e.name.trim()) this.notifier.notify('info', `Entity "${e.name}" added.`);
		return e.id;
	};
	updateEntity = <K extends keyof DataEntity>(entityId: string, field: K, value: DataEntity[K]) => {
		const e = this.draft.entities.find((e) => e.id === entityId);
		if (!e) return;
		(e as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('data.entities');
	};
	removeEntity = (entityId: string) => {
		this.draft.entities = this.draft.entities.filter((e) => e.id !== entityId);
		this.draft.fields = this.draft.fields.filter((f) => f.entityId !== entityId);
		// Clear relations that pointed at the removed entity.
		for (const f of this.draft.fields)
			if (f.relationTargetEntityId === entityId) f.relationTargetEntityId = null;
		this.#touch('data.entities');
	};

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
		this.#touch('data.fields');
	};
	setFieldType = (fieldId: string, type: FieldType) => {
		const f = this.draft.fields.find((f) => f.id === fieldId);
		if (!f) return;
		f.type = type;
		if (type !== 'relation') f.relationTargetEntityId = null;
		this.#touch('data.fields');
	};
	addNestedField = (parentFieldId: string): string | null => {
		const parent = this.draft.fields.find((f) => f.id === parentFieldId);
		if (!parent) return null;
		parent.type = 'object';
		parent.relationTargetEntityId = null;
		const f = createField(parent.entityId, { parentFieldId });
		this.draft.fields.push(f);
		this.#touch('data.fields');
		return f.id;
	};
	removeField = (fieldId: string) => {
		const removeIds = new Set([fieldId, ...descendantFieldIds(this.draft, fieldId)]);
		this.draft.fields = this.draft.fields.filter((f) => !removeIds.has(f.id));
		this.#touch('data.fields');
	};

	/* ───────────────────────────── INTERFACES ──────────────────────────── */
	addInterface = (overrides: Partial<Interface> = {}): string => {
		const i = createInterface(overrides);
		this.draft.interfaces.push(i);
		this.#touch('data.interfaces');
		if (i.fromBrick.trim() && i.toBrick.trim()) {
			this.notifier.notify('info', `Interface ${i.fromBrick} → ${i.toBrick} (${i.protocol}) added.`);
		}
		return i.id;
	};
	updateInterface = <K extends keyof Interface>(id: string, field: K, value: Interface[K]) => {
		const i = this.draft.interfaces.find((i) => i.id === id);
		if (!i) return;
		(i as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('data.interfaces');
	};
	removeInterface = (id: string) => {
		this.draft.interfaces = this.draft.interfaces.filter((i) => i.id !== id);
		this.#touch('data.interfaces');
	};

	/* ─────────────────────── DERIVE FROM JOURNEYS ──────────────────────── */
	/**
	 * Create a table shell for every entity the journeys reference but that
	 * isn't modeled yet, seeding it with the fields those steps touched. The
	 * heart of "no forgotten table". Places new tables on the first database if
	 * there is exactly one (the common case).
	 */
	deriveEntities = () => {
		const have = new Set(this.draft.entities.map((e) => e.name.trim().toLowerCase()));
		const onlyDb = this.draft.databases.length === 1 ? this.draft.databases[0].id : null;
		let created = 0;
		for (const d of this.draft.derivedEntities) {
			if (have.has(d.name.trim().toLowerCase())) continue;
			const entity = createEntity({
				name: d.name,
				databaseId: onlyDb,
				derivedFrom: 'journey',
				sourceRefId: d.name
			});
			this.draft.entities.push(entity);
			for (const fieldName of d.fields) {
				this.draft.fields.push(createField(entity.id, { name: fieldName, type: 'string' }));
			}
			created++;
		}
		if (created > 0) this.#touch('data.derive');
		this.notifier.notify(
			'info',
			created > 0
				? `Derived ${created} table${created === 1 ? '' : 's'} from journeys.`
				: 'Every referenced table already exists.'
		);
	};

	refreshDerived = async () => {
		try {
			const res = await fetch(
				`/api/draft/data?projectId=${encodeURIComponent(this.draft.projectId)}`
			);
			if (!res.ok) throw new Error(`refresh failed (${res.status})`);
			const { derivedEntities } = (await res.json()) as {
				derivedEntities: ProjectDataDraft['derivedEntities'];
			};
			this.draft.derivedEntities = derivedEntities;
			this.notifier.notify('info', `Re-read ${derivedEntities.length} table(s) from journeys.`);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'refresh failed');
		}
	};

	/* ─────────────────────────────── RESET ─────────────────────────────── */
	reset = () => {
		this.draft.entities = [];
		this.draft.fields = [];
		this.draft.interfaces = [];
		this.#touch('data.reset');
	};
}
