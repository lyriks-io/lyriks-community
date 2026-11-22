import { shortDate } from '$domain/activity';
import { requestPagePath } from '$domain/evolution';
import type { RequestValidation } from '$domain/retrospec';

/**
 * What an element validated through a landed change request reads on the
 * Specification 360° (criterion a6174f4b of EVO-002): Validated through the
 * request by its key, the key opening the request, with who approved it and when.
 */
export interface ThroughBadge {
	readonly label: string;
	readonly key: string;
	readonly href: string;
	readonly detail: string;
}

export function throughBadge(projectId: string, through: RequestValidation): ThroughBadge {
	const who = through.approvedBy.map((p) => p.name).join(', ');
	const when = shortDate(through.at);
	return {
		label: 'Validated through',
		key: through.requestKey,
		href: requestPagePath(projectId, through.requestId),
		detail: [who ? `approved by ${who}` : 'approved', when ? `on ${when}` : ''].filter(Boolean).join(' ')
	};
}
