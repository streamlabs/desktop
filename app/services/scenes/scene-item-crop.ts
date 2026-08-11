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

  return {
    ...normalized,
    referenceWidth: validReference(crop.referenceWidth)
      ? crop.referenceWidth
      : referenceSize.baseWidth,
    referenceHeight: validReference(crop.referenceHeight)
      ? crop.referenceHeight
      : referenceSize.baseHeight,
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
