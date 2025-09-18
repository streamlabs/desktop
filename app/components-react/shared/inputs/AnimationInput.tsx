import React from 'react';
import { ListInput, TListInputProps } from './ListInput';
import { InputComponent } from './inputs';
import { $t } from 'services/i18n';

const eventInAnimations = () => [
  { label: $t('Bounce'), value: 'bounce' },
  { label: $t('Bounce In'), value: 'bounceIn' },
  { label: $t('Bounce In Down'), value: 'bounceInDown' },
  { label: $t('Bounce In Left'), value: 'bounceInLeft' },
  { label: $t('Bounce In Right'), value: 'bounceInRight' },
  { label: $t('Bounce In Up'), value: 'bounceInUp' },
  { label: $t('Fade In'), value: 'fadeIn' },
  { label: $t('Fade In Down'), value: 'fadeInDown' },
  { label: $t('Fade In Down Big'), value: 'fadeInDownBig' },
  { label: $t('Fade In Left'), value: 'fadeInLeft' },
  { label: $t('Fade In Left Big'), value: 'fadeInLeftBig' },
  { label: $t('Fade In Right'), value: 'fadeInRight' },
  { label: $t('Fade In Up'), value: 'fadeInUp' },
  { label: $t('Fade In Up Big'), value: 'fadeInUpBig' },
  { label: $t('Light Speed In'), value: 'lightSpeedIn' },
  { label: $t('Flash'), value: 'flash' },
  { label: $t('Pulse'), value: 'pulse' },
  { label: $t('Rubberband'), value: 'rubberband' },
  { label: $t('Shake'), value: 'shake' },
  { label: $t('Swing'), value: 'swing' },
  { label: $t('Tada'), value: 'tada' },
  { label: $t('Wobble'), value: 'wobble' },
  { label: $t('Jello'), value: 'jello' },
  { label: $t('Hinge'), value: 'hinge' },
  { label: $t('Roll In'), value: 'rollIn' },
  { label: $t('Rotate In Left'), value: 'rotateInLeft' },
  { label: $t('Rotate In Right'), value: 'rotateInRight' },
  { label: $t('Zoom In'), value: 'zoomIn' },
  { label: $t('Zoom In Down'), value: 'zoomInDown' },
  { label: $t('Zoom In Left'), value: 'zoomInLeft' },
  { label: $t('Zoom In Right'), value: 'zoomInRight' },
  { label: $t('Zoom In Up'), value: 'zoomInUp' },
  { label: $t('Slide In Down'), value: 'slideInDown' },
  { label: $t('Slide In Left'), value: 'slideInLeft' },
  { label: $t('Slide In Right'), value: 'slideInRight' },
];

const eventOutAnimations = () => [
  { label: $t('Bounce Out'), value: 'bounceOut' },
  { label: $t('Bounce Out Down'), value: 'bounceOutDown' },
  { label: $t('Bounce Out Left'), value: 'bounceOutLeft' },
  { label: $t('Bounce Out Right'), value: 'bounceOutRight' },
  { label: $t('Bounce Out Up'), value: 'bounceOutUp' },
  { label: $t('Fade Out'), value: 'fadeOut' },
  { label: $t('Fade Out Down'), value: 'fadeOutDown' },
  { label: $t('Fade Out Down Big'), value: 'fadeOutDownBig' },
  { label: $t('Fade Out Left'), value: 'fadeOutLeft' },
  { label: $t('Fade Out Left Big'), value: 'fadeOutLeftBig' },
  { label: $t('Fade Out Right'), value: 'fadeOutRight' },
  { label: $t('Fade Out Up'), value: 'fadeOutUp' },
  { label: $t('Fade Out Up Big'), value: 'fadeOutUpBig' },
  { label: $t('Light Speed Out'), value: 'lightSpeedOut' },
  { label: $t('Hinge'), value: 'hinge' },
  { label: $t('Roll Out'), value: 'rollOut' },
  { label: $t('Rotate Out Left'), value: 'rotateOutLeft' },
  { label: $t('Rotate Out Right'), value: 'rotateOutRight' },
  { label: $t('Zoom Out'), value: 'zoomOut' },
  { label: $t('Zoom Out Down'), value: 'zoomOutDown' },
  { label: $t('Zoom Out Left'), value: 'zoomOutLeft' },
  { label: $t('Zoom Out Right'), value: 'zoomOutRight' },
  { label: $t('Zoom Out Up'), value: 'zoomOutUp' },
];

const inAnimations = () => [
  { label: $t('Bounce In'), value: 'bounceIn' },
  { label: $t('Bounce In Down'), value: 'bounceInDown' },
  { label: $t('Bounce In Left'), value: 'bounceInLeft' },
  { label: $t('Bounce In Right'), value: 'bounceInRight' },
  { label: $t('Bounce In Up'), value: 'bounceInUp' },
  { label: $t('Fade In'), value: 'fadeIn' },
  { label: $t('Fade In Down'), value: 'fadeInDown' },
  { label: $t('Fade In Down Big'), value: 'fadeInDownBig' },
  { label: $t('Fade In Left'), value: 'fadeInLeft' },
  { label: $t('Fade In Left Big'), value: 'fadeInLeftBig' },
  { label: $t('Fade In Right'), value: 'fadeInRight' },
  { label: $t('Fade In Right Big'), value: 'fadeInRightBig' },
  { label: $t('Fade In Up'), value: 'fadeInUp' },
  { label: $t('Fade In Up Big'), value: 'fadeInUpBig' },
  { label: $t('Flip In X'), value: 'flipInX' },
  { label: $t('Flip In Y'), value: 'flipInY' },
  { label: $t('Light Speed In'), value: 'lightSpeedIn' },
  { label: $t('Rotate In'), value: 'rotateIn' },
  { label: $t('Rotate In Down Left'), value: 'rotateInDownLeft' },
  { label: $t('Rotate In Down Right'), value: 'rotateInDownRight' },
  { label: $t('Rotate In Up Left'), value: 'rotateInUpLeft' },
  { label: $t('Rotate In Up Right'), value: 'rotateInUpRight' },
  { label: $t('Roll In'), value: 'rollIn' },
  { label: $t('Zoom In'), value: 'zoomIn' },
  { label: $t('Zoom In Down'), value: 'zoomInDown' },
  { label: $t('Zoom In Left'), value: 'zoomInLeft' },
  { label: $t('Zoom In Right'), value: 'zoomInRight' },
  { label: $t('Zoom In Up'), value: 'zoomInUp' },
  { label: $t('Slide In Down'), value: 'slideInDown' },
  { label: $t('Slide In Left'), value: 'slideInLeft' },
  { label: $t('Slide In Right'), value: 'slideInRight' },
  { label: $t('Slide In Up'), value: 'slideInUp' },
];

const outAnimations = () => [
  { label: $t('Bounce Out'), value: 'bounceOut' },
  { label: $t('Bounce Out Down'), value: 'bounceOutDown' },
  { label: $t('Bounce Out Left'), value: 'bounceOutLeft' },
  { label: $t('Bounce Out Right'), value: 'bounceOutRight' },
  { label: $t('Bounce Out Up'), value: 'bounceOutUp' },
  { label: $t('Fade Out'), value: 'fadeOut' },
  { label: $t('Fade Out Down'), value: 'fadeOutDown' },
  { label: $t('Fade Out Down Big'), value: 'fadeOutDownBig' },
  { label: $t('Fade Out Left'), value: 'fadeOutLeft' },
  { label: $t('Fade Out Left Big'), value: 'fadeOutLeftBig' },
  { label: $t('Fade Out Right'), value: 'fadeOutRight' },
  { label: $t('Fade Out Right Big'), value: 'fadeOutRightBig' },
  { label: $t('Fade Out Up'), value: 'fadeOutUp' },
  { label: $t('Fade Out Up Big'), value: 'fadeOutUpBig' },
  { label: $t('Flip Out X'), value: 'flipOutX' },
  { label: $t('Flip Out Y'), value: 'flipOutY' },
  { label: $t('Light Speed Out'), value: 'lightSpeedOut' },
  { label: $t('Rotate Out'), value: 'rotateOut' },
  { label: $t('Rotate Out Down Left'), value: 'rotateOutDownLeft' },
  { label: $t('Rotate Out Down Right'), value: 'rotateOutDownRight' },
  { label: $t('Rotate Out Up Left'), value: 'rotateOutUpLeft' },
  { label: $t('Rotate Out Up Right'), value: 'rotateOutUpRight' },
  { label: $t('Roll Out'), value: 'rollOut' },
  { label: $t('Zoom Out'), value: 'zoomOut' },
  { label: $t('Zoom Out Down'), value: 'zoomOutDown' },
  { label: $t('Zoom Out Left'), value: 'zoomOutLeft' },
  { label: $t('Zoom Out Right'), value: 'zoomOutRight' },
  { label: $t('Zoom Out Up'), value: 'zoomOutUp' },
  { label: $t('Slide Out Down'), value: 'slideOutDown' },
  { label: $t('Slide Out Left'), value: 'slideOutLeft' },
  { label: $t('Slide Out Right'), value: 'slideOutRight' },
  { label: $t('Slide Out Up'), value: 'slideOutUp' },
];

const textAnimations = () => [
  { label: $t('None'), value: '' },
  { label: $t('Bounce'), value: 'bounce' },
  { label: $t('Pulse'), value: 'pulse' },
  { label: $t('Rubber Band'), value: 'rubberBand' },
  { label: $t('Tada'), value: 'tada' },
  { label: $t('Wave'), value: 'wave' },
  { label: $t('Wiggle'), value: 'wiggle' },
  { label: $t('Wobble'), value: 'wobble' },
];

export const AnimationInput = InputComponent((p: TListInputProps<string>) => {
  function listInputMetadata() {
    switch (p.filter) {
      case 'in':
        return { ...p, options: inAnimations() };
      case 'out':
        return { ...p, options: outAnimations() };
      case 'text':
        return { ...p, options: textAnimations() };
      case 'eventIn':
        return { ...p, options: eventInAnimations() };
      case 'eventOut':
        return { ...p, options: eventOutAnimations() };
      default:
        return {
          ...p,
          options: textAnimations().concat(inAnimations()).concat(outAnimations()),
        };
    }
  }

  return <ListInput {...listInputMetadata()} />;
});
