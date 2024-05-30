import { BaseInputController } from './base';
import { sleep } from '../../sleep';
import { getClient } from '../core';

export class SliderInputController extends BaseInputController<number> {
  async setValue(value: number) {
    const goalValue = Number(value);
    const client = getClient();
    const $el = await this.getElement();
    const $rail = await $el.$('.ant-slider-rail');

    let moveOffset = await $rail.getSize('width');

    let handlePos = await getHandleCenter($el);
    const railPos = await $rail.getLocation();

    // reset slider to 0 position
    await client.performActions([
      {
        type: 'pointer',
        id: 'pointer1',
        parameters: { pointerType: 'mouse' },
        actions: [
          {
            type: 'pointerMove',
            duration: 0,
            x: Math.ceil(handlePos.x),
            y: Math.ceil(handlePos.y),
          },
          { type: 'pointerDown', button: 0 },
          {
            type: 'pointerMove',
            duration: 100,
            x: Math.ceil(railPos.x),
            y: Math.ceil(railPos.y),
          },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);

    // check the goal value is not out of bounds
    const currentValue = await this.getValue();
    if (goalValue < currentValue) {
      throw new Error(
        `Attempted to set slider value to "${goalValue}", but the minimum value is "${currentValue}"`,
      );
    }

    // Get new dot position
    handlePos = await getHandleCenter($el);

    // Start the dragging action
    await client.performActions([
      {
        type: 'pointer',
        id: 'pointer1',
        parameters: { pointerType: 'mouse' },
        actions: [
          {
            type: 'pointerMove',
            duration: 0,
            x: Math.ceil(handlePos.x),
            y: Math.ceil(handlePos.y),
          },
          { type: 'pointerDown', button: 0 },
        ],
      },
    ]);

    // use a bisection method to find the correct slider position
    while (true) {
      const currentValue = await this.getValue();

      if (currentValue === goalValue) {
        // we've found it
        await client.releaseActions();
        return;
      }

      let xOffset = Math.round(moveOffset);
      if (value < currentValue) xOffset *= -1;

      await client.performActions([
        {
          type: 'pointer',
          id: 'pointer1',
          parameters: { pointerType: 'mouse' },
          actions: [
            {
              type: 'pointerMove',
              duration: 10,
              origin: 'pointer',
              x: Math.round(xOffset),
              y: 0,
            },
          ],
        },
      ]);

      moveOffset = moveOffset / 2;
      if (moveOffset < 0.3) {
        await client.releaseActions();
        throw new Error('Slider position setup failed');
      }
    }
  }

  async getValue() {
    const $el = await this.getElement();
    return Number(await $el.getAttribute('data-value'));
  }
}

async function getHandleCenter($el: any) {
  const $handle = await $el.$('.ant-slider-handle');
  const topLeft = await $handle.getLocation();
  return {
    x: topLeft.x + 7,
    y: topLeft.y + 7,
  };
}
