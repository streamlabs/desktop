export interface ICropReferenceSize {
  baseWidth: number;
  baseHeight: number;
}

function cropStrips(crop: ICrop): ICrop {
  return {
    top: crop.top,
    right: crop.right,
    bottom: crop.bottom,
    left: crop.left,
  };
}

function validReference(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function hasValidReferencePair(
  crop: Partial<ICrop>,
): crop is Partial<ICrop> & {
  referenceWidth: number;
  referenceHeight: number;
} {
  return validReference(crop.referenceWidth) && validReference(crop.referenceHeight);
}

function hasCompleteCropStrips(crop: Partial<ICrop>): crop is ICrop {
  return (
    crop.top !== undefined &&
    crop.right !== undefined &&
    crop.bottom !== undefined &&
    crop.left !== undefined
  );
}

function cropStripsEqual(first: ICrop, second: ICrop): boolean {
  return (
    first.top === second.top &&
    first.right === second.right &&
    first.bottom === second.bottom &&
    first.left === second.left
  );
}

/**
 * Resolve stored crop strips into the pixels used by the item's current canvas. Libobs truncates
 * scaled scene-source crop strips to integers, so editor geometry must do the same.
 */
export function getEffectiveCrop(
  crop: ICrop,
  isSceneSource: boolean,
  currentSize: ICropReferenceSize,
): ICrop {
  const effective = cropStrips(crop);
  if (!isSceneSource || !hasValidReferencePair(crop)) return effective;

  const horizontalScale = currentSize.baseWidth / crop.referenceWidth;
  const verticalScale = currentSize.baseHeight / crop.referenceHeight;

  return {
    top: Math.trunc(crop.top * verticalScale),
    right: Math.trunc(crop.right * horizontalScale),
    bottom: Math.trunc(crop.bottom * verticalScale),
    left: Math.trunc(crop.left * horizontalScale),
  };
}

/**
 * Scene-source crop strips are authored in canvas space, so relative-coordinate mode needs the
 * canvas against which they were authored. Legacy four-field crops adopt the already-restored
 * per-display collection baseline. Ordinary input crops remain source-pixel values.
 */
export function normalizeLoadedCrop(
  crop: ICrop,
  isSceneSource: boolean,
  referenceSize: ICropReferenceSize,
): ICrop {
  const normalized = cropStrips(crop);
  if (!isSceneSource) return normalized;

  const hasSavedReference = hasValidReferencePair(crop);

  return {
    ...normalized,
    referenceWidth: hasSavedReference ? crop.referenceWidth : referenceSize.baseWidth,
    referenceHeight: hasSavedReference ? crop.referenceHeight : referenceSize.baseHeight,
  };
}

/**
 * A user crop edit intentionally reanchors a scene source to its current display canvas. This
 * also strips stale references merged from the previous transform. Input crops stay four-field.
 */
export function normalizeEditedCrop(
  crop: ICrop,
  isSceneSource: boolean,
  referenceSize: ICropReferenceSize,
): ICrop {
  const normalized = {
    top: Math.round(crop.top),
    right: Math.round(crop.right),
    bottom: Math.round(crop.bottom),
    left: Math.round(crop.left),
  };
  if (!isSceneSource) return normalized;

  return {
    ...normalized,
    referenceWidth: referenceSize.baseWidth,
    referenceHeight: referenceSize.baseHeight,
  };
}

/**
 * Apply a crop patch without confusing a stored transform snapshot with a user edit. Explicit,
 * valid reference dimensions preserve authored strips. Reference-free edits operate on the
 * effective current-canvas crop and then acquire the current canvas as their new reference.
 */
export function applyCropPatch(
  currentCrop: ICrop,
  patch: Partial<ICrop>,
  isSceneSource: boolean,
  currentSize: ICropReferenceSize,
): ICrop {
  if (isSceneSource && hasCompleteCropStrips(patch) && hasValidReferencePair(patch)) {
    return normalizeLoadedCrop({ ...currentCrop, ...patch }, true, currentSize);
  }

  const effectiveCrop = getEffectiveCrop(currentCrop, isSceneSource, currentSize);
  const editedCrop: ICrop = {
    top: patch.top !== undefined ? patch.top : effectiveCrop.top,
    right: patch.right !== undefined ? patch.right : effectiveCrop.right,
    bottom: patch.bottom !== undefined ? patch.bottom : effectiveCrop.bottom,
    left: patch.left !== undefined ? patch.left : effectiveCrop.left,
  };
  const normalized = normalizeEditedCrop(editedCrop, isSceneSource, currentSize);

  // Merely writing the currently displayed values must not discard a lossless authored reference.
  if (
    isSceneSource &&
    hasValidReferencePair(currentCrop) &&
    cropStripsEqual(normalized, effectiveCrop)
  ) {
    return currentCrop;
  }

  return normalized;
}
