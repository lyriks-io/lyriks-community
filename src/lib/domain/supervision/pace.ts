import type { Assignment } from './draft';

/**
 * Pure team-pace analysis for the Supervision task board. Aggregates
 * assignments by member, measures each member's pace against the team average,
 * and surfaces rhythm-and-alignment RISKS — never a nominal productivity
 * ranking (no individual is scored or compared beyond alignment).
 */

export type Pace = 'ahead' | 'ontrack' | 'behind';

export interface Member {
	name: string;
	items: Assignment[];
	avg: number;
	overdue: boolean;
	pace: Pace;
}

export interface TeamPace {
	list: Member[];
	teamAvg: number;
}

/** Two-letter initials for an avatar. */
export function initials(name: string): string {
	return (name || '?')
		.split(/\s+/)
		.map((w) => w[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}

export function computeTeamPace(assignments: Assignment[]): TeamPace {
	const byName = new Map<string, Assignment[]>();
	for (const a of assignments) {
		if (!a.assignee) continue;
		const items = byName.get(a.assignee) ?? [];
		items.push(a);
		byName.set(a.assignee, items);
	}
	const list: Member[] = [...byName.entries()].map(([name, items]) => {
		const avg = Math.round(items.reduce((s, a) => s + a.progress, 0) / items.length);
		const overdue = items.some((a) => a.dueInDays < 0 && a.status !== 'done');
		return { name, items, avg, overdue, pace: 'ontrack' };
	});
	const teamAvg = list.length
		? Math.round(list.reduce((s, m) => s + m.avg, 0) / list.length)
		: 0;
	for (const m of list) {
		m.pace = m.overdue
			? 'behind'
			: m.avg >= teamAvg + 12
				? 'ahead'
				: m.avg <= teamAvg - 12
					? 'behind'
					: 'ontrack';
	}
	list.sort((a, b) => b.avg - a.avg);
	return { list, teamAvg };
}

export type RiskSeverity = 'high' | 'med' | 'low';

/** A compact view of one assignment behind a risk — the drill-down row. */
export interface RiskItem {
	label: string;
	assignee: string;
	status: Assignment['status'];
	dueInDays: number;
	progress: number;
}

export interface Risk {
	severity: RiskSeverity;
	label: string;
	detail: string;
	/** The assignments this risk is built from, so the card can show the detail. */
	items?: RiskItem[];
}

const toItem = (a: Assignment): RiskItem => ({
	label: a.scopeLabel,
	assignee: a.assignee,
	status: a.status,
	dueInDays: a.dueInDays,
	progress: a.progress
});

/** Spot rhythm-misalignment risks across the assignments and the team. */
export function detectRisks(assignments: Assignment[], pace: TeamPace): Risk[] {
	const risks: Risk[] = [];

	const overdue = assignments.filter((a) => a.dueInDays < 0 && a.status !== 'done');
	if (overdue.length > 0) {
		risks.push({
			severity: 'high',
			label: `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue`,
			detail: overdue
				.map((a) => a.scopeLabel)
				.slice(0, 3)
				.join(', '),
			items: overdue.map(toItem)
		});
	}

	const unassignedSoon = assignments.filter(
		(a) => !a.assignee && a.dueInDays <= 2 && a.status !== 'done'
	);
	if (unassignedSoon.length > 0) {
		risks.push({
			severity: 'high',
			label: `${unassignedSoon.length} unassigned task${unassignedSoon.length > 1 ? 's' : ''} due soon`,
			detail: `${unassignedSoon.map((a) => a.scopeLabel).slice(0, 3).join(', ')} · assign an owner`,
			items: unassignedSoon.map(toItem)
		});
	}

	for (const m of pace.list) {
		const d = m.avg - pace.teamAvg;
		if (d <= -20) {
			risks.push({
				severity: 'high',
				label: `${m.name} is ${Math.abs(d)}% below team pace`,
				detail: `Avg ${m.avg}% vs team ${pace.teamAvg}% · rebalance the scope or unblock them.`,
				items: m.items.map(toItem)
			});
		} else if (d >= 25) {
			risks.push({
				severity: 'low',
				label: `${m.name} is ${d}% ahead of the team`,
				detail: `Avg ${m.avg}% vs team ${pace.teamAvg}% · could pick up an at-risk scope.`,
				items: m.items.map(toItem)
			});
		}
		if (m.items.length > 0 && m.items.every((a) => a.status === 'todo')) {
			risks.push({
				severity: 'med',
				label: `${m.name} has not started any assignment`,
				detail: 'Confirm they are unblocked.',
				items: m.items.map(toItem)
			});
		}
	}

	if (pace.list.length >= 2) {
		const top = pace.list[0];
		const bottom = pace.list[pace.list.length - 1];
		const gap = top.avg - bottom.avg;
		if (gap >= 50) {
			risks.push({
				severity: 'med',
				label: `Wide pace gap (${gap}%) across the team`,
				detail: `${top.name} (${top.avg}%) vs ${bottom.name} (${bottom.avg}%), efforts may drift out of sync.`,
				items: [...top.items, ...bottom.items].map(toItem)
			});
		}
	}

	const rank: Record<RiskSeverity, number> = { high: 0, med: 1, low: 2 };
	return risks.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
