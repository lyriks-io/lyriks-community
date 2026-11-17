<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Icon } from '$ui/design-system';
	import MentionTextarea from './MentionTextarea.svelte';

	/**
	 * An answer edited as the list it reads as, point by point (ac-evo-form-list-edit):
	 * the point clicked opens alone as a field, the others read as they did until a
	 * click opens them too; opened from the pencil, every point is a field. Enter
	 * opens a new point under the one being written, Backspace on an empty point
	 * removes it and goes back to the open point above; a point is added at the end
	 * or removed with its own control. What is saved is the list as edited, one
	 * point per line, the points left closed as they were.
	 */
	interface Props {
		projectId: string;
		points: readonly string[];
		/** Whether a point may cite an element of the product with @. */
		cite: boolean;
		placeholder?: string;
		/** The point a click opened alone, by its place in the list; null opens every point. */
		only?: number | null;
		/** How a point left closed reads (its citations as chips). */
		read?: Snippet<[string]>;
		onchange: (points: string[]) => void;
	}
	let { projectId, points, cite, placeholder, only = null, read, onchange }: Props = $props();

	let list = $state(untrack(() => (points.length > 0 ? [...points] : [''])));
	const first = untrack(() => (only !== null && only >= 0 && only < list.length ? only : null));
	let focused = $state(first ?? untrack(() => list.length - 1));
	// Each point keeps its own key, so adding or removing one never hands a typed text to its neighbour.
	let keys = $state(untrack(() => list.map((_, i) => i)));
	let next = untrack(() => list.length);
	// The points open as fields, by key: the one clicked, or all of them.
	let opened = $state<number[]>(untrack(() => (first === null ? [...keys] : [keys[first]])));
	const isOpen = (i: number) => opened.includes(keys[i]);

	function changed() {
		onchange([...list]);
	}
	function openPoint(i: number) {
		if (!isOpen(i)) opened.push(keys[i]);
		focused = i;
	}
	function insertAfter(i: number) {
		const key = next++;
		list.splice(i + 1, 0, '');
		keys.splice(i + 1, 0, key);
		opened.push(key);
		focused = i + 1;
		changed();
	}
	function remove(i: number) {
		if (list.length === 1) {
			list[0] = '';
			focused = 0;
		} else {
			list.splice(i, 1);
			keys.splice(i, 1);
			// Back to the nearest open point above, if there is one.
			let above = i - 1;
			while (above >= 0 && !isOpen(above)) above--;
			focused = above;
		}
		changed();
	}
	function onkey(i: number, e: KeyboardEvent) {
		if (e.isComposing) return;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			insertAfter(i);
		} else if (e.key === 'Backspace' && list[i] === '' && list.length > 1) {
			e.preventDefault();
			remove(i);
		}
	}
</script>

<ol class="space-y-1.5" aria-label="Points of the answer">
	{#each list as point, i (keys[i])}
		<li class="flex items-start gap-2">
			<span class="mt-3.5 size-1 shrink-0 bg-ink-3"></span>
			{#if isOpen(i)}
				<div class="min-w-0 flex-1">
					<MentionTextarea
						{projectId}
						value={point}
						compact
						{cite}
						autofocus={focused === i}
						label="Point {i + 1}"
						placeholder={i === 0 ? placeholder : 'Another point…'}
						oninput={(v) => {
							list[i] = v;
							changed();
						}}
						onkeydown={(e) => onkey(i, e)}
					/>
				</div>
				<button type="button" class="mt-2 shrink-0 rounded-field p-1 text-ink-3 hover:bg-toner-1 hover:text-red-ink" aria-label="Remove point {i + 1}" onclick={() => remove(i)}>
					<Icon name="x" size={12} />
				</button>
			{:else}
				<!-- A point left closed reads as it did; a click opens it too. -->
				<button type="button" class="min-w-0 flex-1 rounded-field px-3 py-2 text-left text-sm leading-relaxed text-ink-900 hover:bg-toner-1 hover:text-blue-ink" title="Edit this point" onclick={() => openPoint(i)}>
					{#if read}{@render read(point)}{:else}{point}{/if}
				</button>
				<span class="size-5 shrink-0" aria-hidden="true"></span>
			{/if}
		</li>
	{/each}
</ol>
<button type="button" class="mt-1.5 flex items-center gap-1 rounded-field px-1 py-0.5 text-xs font-semibold text-blue-ink hover:bg-toner-1" onclick={() => insertAfter(list.length - 1)}>
	<Icon name="plus" size={12} />Add a point
</button>
