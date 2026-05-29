import React, { CSSProperties, useMemo } from 'react';
import { Tabs as AntdTabs, TabsProps } from 'antd';
import { $t } from 'services/i18n';
import { TSlobsInputProps, ValuesOf } from './inputs';
import omit from 'lodash/omit';

const ANT_TAB_FEATURES = ['type', 'moreIcon', 'tabBarGutter', 'tabPosition'] as const;

interface ITab {
  label: string | JSX.Element;
  id: string;
  content?: JSX.Element;
}
type TTabInputProps = TSlobsInputProps<
  ICustomTabs,
  string,
  TabsProps,
  ValuesOf<typeof ANT_TAB_FEATURES>
>;

interface ICustomTabs {
  tabs?: string[] | ITab[];
  onChange?: (param?: any) => void;
  style?: CSSProperties;
  tabStyle?: CSSProperties;
}

export default function Tabs(p: TTabInputProps) {
  const tabProps = omit(p, 'tabStyle', 'tabs', 'onInput');
  // return dual output tab data by default
  const tabs = useMemo(() => {
    return p.tabs
      ? p.tabs.map((tab: string | ITab) => {
          if (typeof tab === 'string') {
            return {
              label: $t(tab),
              id: tab,
            };
          }
          return tab;
        })
      : [
          {
            label: (
              <span>
                <i className="icon-desktop" style={{ paddingRight: '5px' }} />
                {$t('Horizontal')}
              </span>
            ),
            id: 'horizontal',
          },
          {
            label: (
              <span>
                <i className="icon-phone-case" style={{ paddingRight: '5px' }} />
                {$t('Vertical')}
              </span>
            ),
            id: 'vertical',
          },
        ];
  }, [p.tabs]);

  return (
    <AntdTabs defaultActiveKey={tabs[0].id} {...tabProps}>
      {tabs.map((tab: ITab) => (
        <AntdTabs.TabPane tab={tab.label} key={tab.id} style={p?.tabStyle}>
          {tab.content}
        </AntdTabs.TabPane>
      ))}
    </AntdTabs>
  );
}
