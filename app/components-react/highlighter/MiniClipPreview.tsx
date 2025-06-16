import { CheckboxChangeEvent } from 'antd/lib/checkbox';
import { useVuex } from 'components-react/hooks';
import Highlighter from 'components-react/pages/Highlighter';
import { Services } from 'components-react/service-provider';
import { BoolButtonInput, CheckboxInput } from 'components-react/shared/inputs';
import { SwitchInput } from 'components-react/shared/inputs/SwitchInput';
import React from 'react';
import { SCRUB_HEIGHT, SCRUB_WIDTH } from 'services/highlighter/constants';
import { TClip } from 'services/highlighter/models/highlighter.models';
import styles from './MiniClipPreview.m.less';

export default function MiniClipPreview({
  clipId,
  showDisabled,
  clipStateChanged,
  emitPlayClip,
}: {
  clipId: string;
  showDisabled: boolean;
  clipStateChanged: (clipId: string, newState: boolean) => void;
  emitPlayClip: () => void;
}) {
  const { HighlighterService } = Services;
  const clip = useVuex(() => HighlighterService.views.clipsDictionary[clipId] as TClip);

  return (
    <div
      className={styles.miniClipCheckbox}
      key={clip.path}
      style={{
        display: showDisabled || clip.enabled ? 'inline-block' : 'none',
      }}
    >
      <CheckboxInput
        value={clip.enabled}
        onChange={(val: boolean, ev?: React.ChangeEvent<Element> | CheckboxChangeEvent) => {
          ev?.stopPropagation();
          const newState = !clip.enabled;
          HighlighterService.actions.enableClip(clip.path, newState);
          clipStateChanged(clip.path, newState);
        }}
        className={styles.customCheckbox}
      />
      <img
        onClick={emitPlayClip}
        src={clip.scrubSprite}
        className={styles.thumbnailSpecs}
        style={{
          opacity: !clip.enabled ? '0.3' : '1',
          width: `${SCRUB_WIDTH / 6}px`,
          height: `${SCRUB_HEIGHT / 6}px`,
        }}
      ></img>
    </div>
  );
}
