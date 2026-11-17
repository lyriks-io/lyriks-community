<script lang="ts">
	import { POINT_ORIGIN_LABEL, type PointOrigin } from '$domain/coherence';
	import { TAG, TAG_VIOLET } from '../page/look';

	/**
	 * Where the problem of a point lies, as a small tag (criterion c86ea441): red
	 * when the product as it ships does something wrong, violet for a gap of the
	 * specification, a quiet line for Lyriks's own records. The sheet's first
	 * line says what it means, on hover too.
	 */
	interface Props {
		origin: PointOrigin;
		/** What the origin means for this point, said on hover. */
		means?: string;
	}
	let { origin, means }: Props = $props();
	const TONE: Readonly<Record<PointOrigin, string>> = {
		product: `${TAG} border-red text-red-ink`,
		specification: TAG_VIOLET,
		records: `${TAG} border-line text-ink-3`
	};
</script>

<span class="{TONE[origin]} min-h-[22px] px-[7px] text-[0.6875rem]" title={means}>{POINT_ORIGIN_LABEL[origin]}</span>
