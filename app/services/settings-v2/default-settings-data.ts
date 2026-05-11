import { EVideoFormat, EColorSpace, ERangeType, EScaleType, EFPSType } from 'obs-studio-node';

export const horizontalDisplayData = {
  fpsNum: 30,
  fpsDen: 1,
  baseWidth: 1280,
  baseHeight: 720,
  outputWidth: 1280,
  outputHeight: 720,
  outputFormat: EVideoFormat.I420,
  colorspace: EColorSpace.CS709,
  range: ERangeType.Full,
  scaleType: EScaleType.Bilinear,
  fpsType: EFPSType.Integer,
};

export const verticalDisplayData = {
  fpsNum: 30,
  fpsDen: 1,
  baseWidth: 1080,
  baseHeight: 1920,
  outputWidth: 1080,
  outputHeight: 1920,
  outputFormat: EVideoFormat.I420,
  colorspace: EColorSpace.CS709,
  range: ERangeType.Full,
  scaleType: EScaleType.Bilinear,
  fpsType: EFPSType.Integer,
};
