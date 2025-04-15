import { ICoordinates } from './models/ai-highlighter.models';
import { IAiClip, isAiClip, TClip } from './models/highlighter.models';
import { IExportOptions } from './models/rendering.models';
import { RenderingClip } from './rendering/rendering-clip';

/**
 *
 * @param exportOptions export options to be modified
 * Take the existing export options, flips the resolution to vertical and adds complex filter to move webcam to top
 */
export function addVerticalFilterToExportOptions(
  clips: TClip[],
  renderingClips: RenderingClip[],
  exportOptions: IExportOptions,
) {
  const webcamCoordinates = getWebcamPosition(clips, renderingClips);
  const newWidth = exportOptions.height;
  const newHeight = exportOptions.width;
  // exportOptions.height = exportOptions.width;
  // exportOptions.width = newWidth;
  exportOptions.complexFilter = getWebcamComplexFilterForFfmpeg(
    webcamCoordinates,
    newWidth,
    newHeight,
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
 * @param outputWidth
 * @param outputHeight
 * @returns properly formatted complex filter for ffmpeg to move webcam to top in vertical video
 */
function getWebcamComplexFilterForFfmpeg(
  webcamCoordinates: ICoordinates | null,
  outputWidth: number,
  outputHeight: number,
) {
  if (!webcamCoordinates) {
    return `
      [0:v]crop=ih*${outputWidth}/${outputHeight}:ih,scale=${outputWidth}:-1:force_original_aspect_ratio=increase[final];
      `;
  }

  const webcamTopX = webcamCoordinates?.x1;
  const webcamTopY = webcamCoordinates?.y1;
  const webcamWidth = webcamCoordinates?.x2 - webcamCoordinates?.x1;
  const webcamHeight = webcamCoordinates?.y2 - webcamCoordinates?.y1;

  const oneThirdHeight = outputHeight / 3;
  const twoThirdsHeight = (outputHeight * 2) / 3;

  return `
    [0:v]split=3[webcam][vid][blur_source];
    color=c=black:s=${outputWidth}x${outputHeight}:d=1[base];
    [webcam]crop=w=${webcamWidth}:h=${webcamHeight}:x=${webcamTopX}:y=${webcamTopY},scale=-1:${oneThirdHeight}[webcam_final];
    [vid]crop=ih*${outputWidth}/${twoThirdsHeight}:ih,scale=${outputWidth}:${twoThirdsHeight}[vid_cropped];
    [blur_source]crop=ih*${outputWidth}/${twoThirdsHeight}:ih,scale=${outputWidth}:${oneThirdHeight},gblur=sigma=50[blur];
    [base][blur]overlay=x=0:y=0[blur_base];
    [blur_base][webcam_final]overlay='(${outputWidth}-overlay_w)/2:(${oneThirdHeight}-overlay_h)/2'[base_webcam];
    [base_webcam][vid_cropped]overlay=x=0:y=${oneThirdHeight}[final];
    `;
}
