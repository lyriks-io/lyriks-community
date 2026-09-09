import type { RoadmapOperation } from '$domain/features';

/**
 * Anti-corruption parser for the roadmap batch endpoint (and the MCP's
 * apply_roadmap_batch behind it). Same posture as the other section gates:
 * every issue is reported at once, with the field named, so an agent fixes the
 * batch in one round trip instead of discovering problems one save at a time.
 */

type Shape = Readonly<
	Record<string, 'string' | 'string?' | 'string|null' | 'number?' | 'status'>
>;

const STATUSES = ['backlog', 'in-progress', 'done'] as const;

/** Field contracts per op. `string|null` = required but nullable (an explicit clear). */
const OP_SHAPES: Readonly<Record<RoadmapOperation['op'], Shape>> = {
	create_release: { id: 'string?', name: 'string?', version: 'string?', weekStart: 'number?', weekEnd: 'number?', description: 'string?' },
	update_release: { releaseId: 'string', name: 'string?', version: 'string?', weekStart: 'number?', weekEnd: 'number?', order: 'number?', description: 'string?' },
	archive_release: { releaseId: 'string' },
	unarchive_release: { releaseId: 'string' },
	remove_release: { releaseId: 'string' },
	create_sprint: { id: 'string?', name: 'string?', startDate: 'string?', endDate: 'string?' },
	update_sprint: { sprintId: 'string', name: 'string?', startDate: 'string?', endDate: 'string?', order: 'number?' },
	archive_sprint: { sprintId: 'string' },
	unarchive_sprint: { sprintId: 'string' },
	remove_sprint: { sprintId: 'string' },
	assign_feature_to_release: { featureId: 'string', releaseId: 'string|null' },
	set_feature_sprint: { featureId: 'string', sprintId: 'string|null' },
	set_feature_status: { featureId: 'string', status: 'status' },
	set_feature_assignee: { featureId: 'string', assigneeId: 'string|null' }
};

export type ParsedRoadmapOperations =
	| { ok: true; operations: RoadmapOperation[] }
	| { ok: false; issues: string[] };

export function parseRoadmapOperations(input: unknown): ParsedRoadmapOperations {
	if (!Array.isArray(input) || input.length === 0) {
		return { ok: false, issues: ['operations must be a non-empty array'] };
	}
	const issues: string[] = [];
	const operations: RoadmapOperation[] = [];

	input.forEach((raw, index) => {
		const at = `operations[${index}]`;
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			issues.push(`${at} must be an object`);
			return;
		}
		const entry = raw as Record<string, unknown>;
		const shape = OP_SHAPES[entry.op as RoadmapOperation['op']];
		if (!shape) {
			issues.push(`${at}.op must be one of: ${Object.keys(OP_SHAPES).join(', ')}`);
			return;
		}
		const parsed: Record<string, unknown> = { op: entry.op };
		for (const key of Object.keys(entry)) {
			if (key !== 'op' && !(key in shape)) issues.push(`${at}.${key} is not a supported field`);
		}
		for (const [key, kind] of Object.entries(shape)) {
			const value = entry[key];
			const path = `${at}.${key}`;
			switch (kind) {
				case 'string':
					if (typeof value !== 'string' || value.length === 0) issues.push(`${path} is required`);
					else parsed[key] = value;
					break;
				case 'string?':
					if (value === undefined) break;
					if (typeof value !== 'string') issues.push(`${path} must be a string`);
					else parsed[key] = value;
					break;
				case 'string|null':
					if (value === null) parsed[key] = null;
					else if (typeof value !== 'string' || value.length === 0)
						issues.push(`${path} must be a non-empty string or null`);
					else parsed[key] = value;
					break;
				case 'number?':
					if (value === undefined) break;
					if (typeof value !== 'number' || !Number.isFinite(value))
						issues.push(`${path} must be a number`);
					else parsed[key] = value;
					break;
				case 'status':
					if (!STATUSES.includes(value as (typeof STATUSES)[number]))
						issues.push(`${path} must be one of: ${STATUSES.join(', ')}`);
					else parsed[key] = value;
					break;
			}
		}
		operations.push(parsed as unknown as RoadmapOperation);
	});

	return issues.length > 0 ? { ok: false, issues } : { ok: true, operations };
}
