import { guard, type Guarded } from './guard';

/**
 * An evolution changes a product its specification describes (criterion
 * 40bef6da): while the specification holds no feature there is nothing to
 * change, so no request opens, from the page or from an AI client, and the
 * refusal says where the product is described first.
 */
export const NO_PRODUCT_YET = 'This product has no specification yet: an evolution changes a product its specification describes.';
export const NO_PRODUCT_HINT =
	'Describe the product first: in Knowledge, by hand or with your AI, or, for an existing product, through its Reverse-Specification. Evolutions start once it holds a feature.';

/** Whether the specification holds a product an evolution can change. */
export const hasProductToChange = (featureCount: number): boolean => featureCount > 0;

/** The refusal of a request opened on a product with nothing specified yet. */
export const productToChange = (featureCount: number): Guarded => guard(!hasProductToChange(featureCount), NO_PRODUCT_YET, NO_PRODUCT_HINT);
