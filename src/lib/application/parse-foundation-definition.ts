import {
	createCompetitor,
	createEmptyDefinitionDraft,
	createIntegration,
	isCertificationCode,
	isEncryptionScope,
	type BusinessCustomReq,
	type CompetitorEntry,
	type IntegrationEntry,
	type KpiEntry,
	type FoundationDefinitionDraft,
	type SlaEntry
} from '$domain/foundation';

/**
 * Anti-corruption guard for untrusted Step 02 payloads (HTTP body). Merges
 * each tab over fresh defaults so every nested key exists with the right shape
 * and pins the projectId from the trusted source. Mirror of `parseIdentityDraft`
 * (Step 01) — kept deliberately permissive in v0; a stricter schema (zod) can
 * drop in later behind this same boundary.
 */
export function parseDefinitionDraft(input: unknown, projectId: string): FoundationDefinitionDraft {
	const base = createEmptyDefinitionDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const businessObjective = (src.businessObjective as Record<string, unknown> | undefined) ?? {};
	const market = (src.market as Record<string, unknown> | undefined) ?? {};
	const competition = (src.competition as Record<string, unknown> | undefined) ?? {};
	const business = (src.business as Record<string, unknown> | undefined) ?? {};
	const technical = (src.technical as Record<string, unknown> | undefined) ?? {};
	const security = (src.security as Record<string, unknown> | undefined) ?? {};
	const arr = <T>(o: Record<string, unknown>, k: string): T[] =>
		Array.isArray(o[k]) ? (o[k] as T[]) : [];
	const str = (o: Record<string, unknown>, k: string, fallback: string): string =>
		typeof o[k] === 'string' ? (o[k] as string) : fallback;

	// `encryption` and `expectedCertifications` are CLOSED vocabularies, but no
	// write path ever enforced them, so free prose landed inside them: a real
	// draft carries the sentence "Relies on Android's own full-disk encryption…"
	// as an `EncryptionScope`. Every consumer then had to guess, and the data
	// projection guessed wrong, publishing "encrypted in transit" for a product
	// that transmits nothing.
	//
	// Keep the entries that ARE codes and MOVE the rest into `custom`, where
	// free-text security requirements already live. Nothing the user wrote is
	// lost, the vocabulary becomes trustworthy, and it is idempotent: once the
	// prose sits in `custom` a re-parse finds none left to move.
	const partitionCodes = <T extends string>(
		key: string,
		isCode: (v: unknown) => v is T
	): { codes: T[]; prose: string[] } => {
		const codes: T[] = [];
		const prose: string[] = [];
		for (const entry of arr<unknown>(security, key)) {
			if (isCode(entry)) codes.push(entry);
			else if (typeof entry === 'string' && entry.trim()) prose.push(entry.trim());
		}
		return { codes, prose };
	};
	const encryption = partitionCodes('encryption', isEncryptionScope);
	const certifications = partitionCodes('expectedCertifications', isCertificationCode);

	// Each stored KPI must carry the full KpiEntry shape — a persisted row missing
	// `name` (or with a null numeric) would otherwise reach the UI raw and crash on
	// `k.name.trim()`. Normalise every entry over the canonical defaults, and accept
	// a KPI given as a bare string or under a loose `label`/`title` key — a
	// programmatic author (MCP) naturally writes `kpis: ["Reduce wait time"]`, and
	// silently dropping those was firing a false "no target KPI" coherence warning.
	const kpis = arr<unknown>(businessObjective, 'kpis')
		.map((raw): KpiEntry => {
			if (typeof raw === 'string') return { name: raw, currentValue: null, targetValue: null, unit: '%' };
			const k = (raw ?? {}) as Record<string, unknown>;
			const name =
				typeof k.name === 'string'
					? k.name
					: typeof k.label === 'string'
						? k.label
						: typeof k.title === 'string'
							? k.title
							: '';
			return {
				name,
				currentValue: typeof k.currentValue === 'number' ? k.currentValue : null,
				targetValue: typeof k.targetValue === 'number' ? k.targetValue : null,
				unit: typeof k.unit === 'string' ? k.unit : '%'
			};
		})
		.filter(
			(k) => k.name.trim().length > 0 || k.currentValue !== null || k.targetValue !== null
		);

	const stringFromLooseListItem = (v: unknown): string | null => {
		if (typeof v === 'string') return v;
		if (v === null || typeof v !== 'object') return null;
		const o = v as Record<string, unknown>;
		for (const key of ['name', 'label', 'value', 'title', 'text', 'description']) {
			const candidate = o[key];
			if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
		}
		return null;
	};
	const stringList = (o: Record<string, unknown>, k: string): string[] =>
		arr<unknown>(o, k)
			.map(stringFromLooseListItem)
			.filter((x): x is string => x !== null && x.trim().length > 0);

	// Same guard for competitors: a competitor persisted as a bare "Name" string or
	// an object missing strengths/weaknesses (e.g. authored via MCP) would reach
	// CompetitionSection raw and crash on `competitor.name.trim()` / TagInput's
	// `.length`, taking the whole Market tab down. Normalise to the full shape.
	const objectStringList = (v: unknown): string[] =>
		Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	const directCompetitors = arr<unknown>(competition, 'directCompetitors').map(
		(c): CompetitorEntry => {
			if (typeof c === 'string') return createCompetitor(c);
			const o = (c ?? {}) as Record<string, unknown>;
			return {
				name: typeof o.name === 'string' ? o.name : '',
				logoUrl: typeof o.logoUrl === 'string' ? o.logoUrl : null,
				strengths: objectStringList(o.strengths),
				weaknesses: objectStringList(o.weaknesses)
			};
		}
	);

	// And again for integrations: an entry persisted as a bare "System name" string
	// (loose MCP authoring) has no {system, direction, criticality} shape, so every
	// cell of the Integrations table renders blank — the row LOOKS empty even though
	// it names a real system. Fold the string into `system` and default the rest.
	const integrations = arr<unknown>(technical, 'integrations').map((e): IntegrationEntry => {
		const d = createIntegration();
		if (typeof e === 'string') return { ...d, system: e };
		const o = (e ?? {}) as Record<string, unknown>;
		return {
			system: typeof o.system === 'string' ? o.system : '',
			direction: (typeof o.direction === 'string' ? o.direction : d.direction) as IntegrationEntry['direction'],
			criticality: (typeof o.criticality === 'string' ? o.criticality : d.criticality) as IntegrationEntry['criticality']
		};
	});

	const slas = arr<unknown>(business, 'slas')
		.map((s): SlaEntry => {
			if (typeof s === 'string') return { metric: s, commitment: '', penalty: '' };
			const o = (s ?? {}) as Record<string, unknown>;
			return {
				metric: typeof o.metric === 'string' ? o.metric : '',
				commitment: typeof o.commitment === 'string' ? o.commitment : '',
				penalty: typeof o.penalty === 'string' ? o.penalty : ''
			};
		})
		.filter(
			(s) =>
				s.metric.trim().length > 0 ||
				s.commitment.trim().length > 0 ||
				s.penalty.trim().length > 0
		);
	const businessCustom = arr<unknown>(business, 'custom')
		.map((c): BusinessCustomReq => {
			if (typeof c === 'string') return { label: c, value: '' };
			const o = (c ?? {}) as Record<string, unknown>;
			return {
				label: typeof o.label === 'string' ? o.label : '',
				value: typeof o.value === 'string' ? o.value : ''
			};
		})
		.filter((c) => c.label.trim().length > 0 || c.value.trim().length > 0);

	// Pain points now carry the users they hurt. Accept the new shape; when it is
	// absent (older draft, or an MCP author writing the legacy flat list), migrate
	// each `painPoints` string into a link with no users yet — nothing is lost, and
	// the free-text `affectedPersonas` stay below for the UI's "re-attach" hint.
	const painPointsLegacy = stringList(businessObjective, 'painPoints');
	const rawLinks = arr<unknown>(businessObjective, 'painPointLinks');
	const painPointLinks =
		rawLinks.length > 0
			? rawLinks
					.map((p) => {
						if (typeof p === 'string') return { id: crypto.randomUUID(), text: p, roleIds: [] };
						const o = (p ?? {}) as Record<string, unknown>;
						return {
							id: typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID(),
							text: typeof o.text === 'string' ? o.text : '',
							roleIds: arr<unknown>(o, 'roleIds').filter((x): x is string => typeof x === 'string')
						};
					})
					.filter((p) => p.text.trim().length > 0)
			: painPointsLegacy.map((text) => ({ id: crypto.randomUUID(), text, roleIds: [] }));

	return {
		...base,
		projectId,
		businessObjective: {
			mainProblem: str(businessObjective, 'mainProblem', base.businessObjective.mainProblem),
			painPointLinks,
			painPoints: painPointsLegacy,
			affectedPersonas: stringList(businessObjective, 'affectedPersonas'),
			expectedOutcome: str(businessObjective, 'expectedOutcome', base.businessObjective.expectedOutcome),
			kpis,
			successCriteria: stringList(businessObjective, 'successCriteria'),
			failureCriteria: stringList(businessObjective, 'failureCriteria'),
			sourceIds: stringList(businessObjective, 'sourceIds')
		},
		market: {
			marketType:
				(market.marketType as FoundationDefinitionDraft['market']['marketType']) ?? base.market.marketType,
			customerSize: arr(market, 'customerSize'),
			industrySectors: stringList(market, 'industrySectors'),
			languages: stringList(market, 'languages'),
			regulations: stringList(market, 'regulations'),
			sourceIds: stringList(market, 'sourceIds')
		},
		competition: {
			directCompetitors,
			indirectCompetitors: stringList(competition, 'indirectCompetitors'),
			businessModels: stringList(competition, 'businessModels'),
			differentiators: stringList(competition, 'differentiators'),
			claimedCategory: str(competition, 'claimedCategory', base.competition.claimedCategory),
			positioning: str(competition, 'positioning', base.competition.positioning),
			competitiveMoat: str(competition, 'competitiveMoat', base.competition.competitiveMoat),
			sourceIds: stringList(competition, 'sourceIds')
		},
		business: {
			objectives: stringList(business, 'objectives'),
			slas,
			contractualConstraints: stringList(business, 'contractualConstraints'),
			contractAttachment:
				typeof business.contractAttachment === 'string' ? business.contractAttachment : null,
			risks: stringList(business, 'risks'),
			custom: businessCustom,
			sourceIds: stringList(business, 'sourceIds')
		},
		technical: {
			compatibilities: stringList(technical, 'compatibilities'),
			integrations,
			apisExpose: arr(technical, 'apisExpose'),
			apisConsume: arr(technical, 'apisConsume'),
			performance: arr(technical, 'performance'),
			availability: str(technical, 'availability', base.technical.availability),
			custom: arr(technical, 'custom'),
			sourceIds: stringList(technical, 'sourceIds')
		},
		security: {
			authentication: arr(security, 'authentication'),
			authorization:
				(security.authorization as FoundationDefinitionDraft['security']['authorization']) ??
				base.security.authorization,
			encryption: encryption.codes,
			auditLogs:
				(security.auditLogs as FoundationDefinitionDraft['security']['auditLogs']) ??
				base.security.auditLogs,
			expectedCertifications: certifications.codes,
			dataRetention: arr(security, 'dataRetention'),
			custom: [
				...arr<BusinessCustomReq>(security, 'custom'),
				...encryption.prose.map((value) => ({ label: 'Encryption', value })),
				...certifications.prose.map((value) => ({ label: 'Certification', value }))
			],
			sourceIds: stringList(security, 'sourceIds')
		}
	};
}
