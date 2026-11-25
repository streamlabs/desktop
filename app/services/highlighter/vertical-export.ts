import { getVideoResolution } from './video-info';
import { IExportOptions, IResolution } from './models/rendering.models';
import { RenderingClip } from './rendering/rendering-clip';

/**
 *
 * @param exportOptions export options to be modified
 * Take the existing export options, flips the resolution to vertical and adds a complex filter
 * that center-crops the video
 */
export async function addVerticalFilterToExportOptions(
  renderingClips: RenderingClip[],
  exportOptions: IExportOptions,
) {
  if (!renderingClips || renderingClips.length === 0) {
    throw new Error('No clips provided');
  }
  const originalResolution = await getVideoResolution(renderingClips[0].sourcePath);
  if (!originalResolution) {
    throw new Error('Could not get video resolution');
  }

  const newResolution = {
    width: exportOptions.height,
    height: exportOptions.width,
  };
  exportOptions.complexFilter = getVerticalComplexFilterForFfmpeg(newResolution);
}

/**
 *
 * @param outputResolution.Width
 * @param outputResolution.Height
 * @returns properly formatted complex filter for ffmpeg to center-crop a vertical video
 */
function getVerticalComplexFilterForFfmpeg(outputResolution: IResolution) {
  return `
      [0:v]crop=ih*${outputResolution.width}/${outputResolution.height}:ih,scale=${outputResolution.width}:-1:force_original_aspect_ratio=increase[final];
      `;
}
