import React from 'react';
import { InputComponent } from './inputs';
import { NumberInput, TNumberInputProps } from './NumberInput';
import { $t } from 'services/i18n';

export const DurationInput = InputComponent((p: TNumberInputProps) => {
  function formatter(value: number) {
    let numberMins = String(Math.floor(value / 60));
    let numberSecs = String(value % 60);
    while (numberMins.length < 2) {
      numberMins = `0${numberMins}`;
    }
    while (numberSecs.length < 2) {
      numberSecs = `0${numberSecs}`;
    }
    return `${numberMins}:${numberSecs}`;
  }

  function parser(value: string) {
    const [mins, secs] = value.split(':');
    return Number(mins) * 60 + Number(secs);
  }

  return <NumberInput {...p} formatter={formatter} parser={parser} min={0} uncontrolled={false} />;
});
