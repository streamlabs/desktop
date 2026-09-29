import execa from 'execa';
import { FFPROBE_EXE } from './constants';
import { IResolution } from './models/rendering.models';

export async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execa(FFPROBE_EXE, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const duration = parseFloat(stdout);
  return duration;
}

export async function getVideoResolution(filePath: string): Promise<IResolution> {
  const { stdout } = await execa(FFPROBE_EXE, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=s=x:p=0',
    filePath,
  ]);

  const [width, height] = stdout.split('x').map(Number);
  return { width, height };
}
