/** Home's greeting (feat-home, criterion 85c17859), by the reader's own clock and their first name. Pure. */
export function greeting(hour: number, name: string): string {
	const hello = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
	const first = name.trim().split(/\s+/)[0];
	return first ? `${hello}, ${first}` : hello;
}
