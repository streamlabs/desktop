import React, { useMemo, useState } from 'react';
import { Collapse } from 'antd';
import cx from 'classnames';
import { IHotkey } from 'services/hotkeys';
import Hotkey from './Hotkey';
import { TDisplayType } from 'services/settings-v2';
import Tabs from 'components-react/shared/Tabs';

interface CommonProps {
  title: string | null;
}

interface HotkeyGroupProps extends CommonProps {
  hotkeys: IHotkey[];
  isSearch: boolean;
  isSceneHotkey?: boolean;
}

interface HeaderProps extends CommonProps {}

const { Panel } = Collapse;

const getHotkeyUniqueId = (hotkey: IHotkey) => {
  return hotkey.actionName + hotkey.sceneId + hotkey.sceneItemId + hotkey.sourceId;
};

function Header({ title }: HeaderProps) {
  return (
    <h2
      className="section-title section-title--dropdown"
      style={{ display: 'inline-block', verticalAlign: '-2px' }}
    >
      {title}
    </h2>
  );
}

export default function HotkeyGroup(props: HotkeyGroupProps) {
  const { hotkeys, title, isSearch, isSceneHotkey } = props;
  const isCollapsible = !!(title && !isSearch);

  const headerProps = { title };

  const [display, setDisplay] = useState<TDisplayType>('horizontal');
  const [expanded, setExpanded] = useState<boolean>(false);

  const showTabs = isSceneHotkey && expanded;

  const renderedHotKeys = useMemo(() => {
    // only filter hotkeys related to scene items
    if (!isSceneHotkey) return hotkeys;

    // Once a scene collection has been converted to a dual output scene collection,
    // the vertical scene items can be bound to hot keys.
    if (expanded) {
      return hotkeys
        .filter(hotkey => hotkey?.display === display || hotkey?.actionName === 'SWITCH_TO_SCENE')
        .map(hotkey => hotkey);
    } else {
      return hotkeys;
    }
  }, [hotkeys, display, expanded]);

  const header = <Header {...headerProps} />;
  const hotkeyContent = useMemo(
    () => (
      <div className={cx({ 'section-content--opened': !!title }, 'section-content')}>
        {renderedHotKeys.map(hotkey => (
          <div
            key={getHotkeyUniqueId(hotkey)}
            className={isSceneHotkey ? 'scene-hotkey' : undefined}
          >
            <Hotkey hotkey={hotkey} />
          </div>
        ))}
      </div>
    ),
    [renderedHotKeys, display],
  );

  return (
    <div className="section">
      {!isCollapsible ? (
        hotkeyContent
      ) : (
        <Collapse
          onChange={() => setExpanded(!expanded)}
          expandIcon={({ isActive }) => (
            <i
              className={cx('fa', 'section-title-icon', {
                'fa-minus': isActive,
                'fa-plus': !isActive,
              })}
            />
          )}
        >
          <Panel header={header} key="1">
            {isSceneHotkey && showTabs && <Tabs onChange={setDisplay} />}
            {hotkeyContent}
          </Panel>
        </Collapse>
      )}
    </div>
  );
}
