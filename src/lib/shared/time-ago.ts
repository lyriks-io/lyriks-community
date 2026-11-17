/** The design's relative time: minutes under an hour, hours under a day, then days. */
export function timeAgo(at: string, now: number = Date.now()): string {
	const m = Math.max(1, Math.floor((now - Date.parse(at)) / 60000));
	if (m < 60) return `${m} min ago`;
	if (m < 1440) return `${Math.floor(m / 60)} h ago`;
	return `${Math.floor(m / 1440)} d ago`;
}
