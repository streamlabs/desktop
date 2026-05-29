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
  baseWidth: 720,
  baseHeight: 1280,
  outputWidth: 720,
  outputHeight: 1280,
  outputFormat: EVideoFormat.I420,
  colorspace: EColorSpace.CS709,
  range: ERangeType.Full,
  scaleType: EScaleType.Bilinear,
  fpsType: EFPSType.Integer,
};
