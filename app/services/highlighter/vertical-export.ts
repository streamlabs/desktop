import { getVideoResolution } from './cut-highlight-clips';
import { ICoordinates } from './models/ai-highlighter.models';
import { IAiClip, isAiClip, TClip } from './models/highlighter.models';
import { IExportOptions, IResolution } from './models/rendering.models';
import { RenderingClip } from './rendering/rendering-clip';

/**
 *
 * @param exportOptions export options to be modified
 * Take the existing export options, flips the resolution to vertical and adds complex filter to move webcam to top
 */
export async function addVerticalFilterToExportOptions(
  clips: TClip[],
  renderingClips: RenderingClip[],
  exportOptions: IExportOptions,
) {
  if (!clips || clips.length === 0) {
    throw new Error('No clips provided');
  }
  const originalResolution = await getVideoResolution(renderingClips[0].sourcePath);
  if (!originalResolution) {
    throw new Error('Could not get video resolution');
  }

  const webcamCoordinates = getWebcamPosition(clips, renderingClips);

  const newResolution = {
    width: exportOptions.height,
    height: exportOptions.width,
  };
  // exportOptions.height = exportOptions.width;
  // exportOptions.width = newWidth;
  exportOptions.complexFilter = getWebcamComplexFilterForFfmpeg(
    webcamCoordinates,
    newResolution,
    originalResolution,
  );
}
/**
 *
 * @param
 * @returns
 * Gets the first webcam position from all of the clips
 * should get webcam position for a specific clip soon
 */
function getWebcamPosition(clips: TClip[], renderingClips: RenderingClip[]) {
  const clipWithWebcam = clips.find(
    clip =>
      isAiClip(clip) &&
      !!clip?.aiInfo?.metadata?.webcam_coordinates &&
      renderingClips.find(renderingClips => renderingClips.sourcePath === clip.path),
  ) as IAiClip;
  return clipWithWebcam?.aiInfo?.metadata?.webcam_coordinates || undefined;
}

/**
 *
 * @param webcamCoordinates
 * @param outputResolution.Width
 * @param outputResolution.Height
 * @returns properly formatted complex filter for ffmpeg to move webcam to top in vertical video
 */
function getWebcamComplexFilterForFfmpeg(
  webcamCoordinates: ICoordinates | null,
  outputResolution: IResolution,
  originalResolution: IResolution,
) {
  if (!webcamCoordinates) {
    return `
      [0:v]crop=ih*${outputResolution.width}/${outputResolution.height}:ih,scale=${outputResolution.width}:-1:force_original_aspect_ratio=increase[final];
      `;
  }
  const scaleFactor =
    Math.max(outputResolution.width, outputResolution.height) /
    Math.max(originalResolution.width, originalResolution.height);

  const webcamTopX = Math.round(webcamCoordinates?.x1 * scaleFactor);
  const webcamTopY = Math.round(webcamCoordinates?.y1 * scaleFactor);
  const webcamWidth = Math.round((webcamCoordinates?.x2 - webcamCoordinates?.x1) * scaleFactor);
  const webcamHeight = Math.round((webcamCoordinates?.y2 - webcamCoordinates?.y1) * scaleFactor);

  const oneThirdHeight = outputResolution.height / 3;
  const twoThirdsHeight = (outputResolution.height * 2) / 3;

  console.log({
    outputResolution: `${outputResolution.width}x${outputResolution.height}`,
    originalResolution: `${originalResolution.width}x${originalResolution.height}`,
    webcamPosition: { x1: webcamTopX, y1: webcamTopY, width: webcamWidth, height: webcamHeight },
    scaleFactor,
    oneThirdHeight,
    twoThirdsHeight,
  });
  return `
    [0:v]split=3[webcam][vid][blur_source];
    color=c=black:s=${outputResolution.width}x${outputResolution.height}:d=1[base];
    [webcam]crop=w=${webcamWidth}:h=${webcamHeight}:x=${webcamTopX}:y=${webcamTopY},scale=-1:${oneThirdHeight}[webcam_final];
    [vid]crop=ih*${outputResolution.width}/${twoThirdsHeight}:ih,scale=${outputResolution.width}:${twoThirdsHeight}[vid_cropped];
    [blur_source]crop=ih*${outputResolution.width}/${twoThirdsHeight}:ih,scale=${outputResolution.width}:${oneThirdHeight},gblur=sigma=50[blur];
    [base][blur]overlay=x=0:y=0[blur_base];
    [blur_base][webcam_final]overlay='(${outputResolution.width}-overlay_w)/2:(${oneThirdHeight}-overlay_h)/2'[base_webcam];
    [base_webcam][vid_cropped]overlay=x=0:y=${oneThirdHeight}[final];
    `;
}
