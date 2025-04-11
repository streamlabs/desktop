import React, { CSSProperties } from 'react';
import { Tabs as AntdTabs } from 'antd';
import { $t } from 'services/i18n';

interface ITab {
  label: string | JSX.Element;
  key: string;
}

interface ITabs {
  tabs?: string[];
  onChange?: (param?: any) => void;
  style?: CSSProperties;
  tabStyle?: CSSProperties;
}

export default function Tabs(p: ITabs) {
  const dualOutputData: ITab[] = [
    {
      label: (
        <span>
          <i className="icon-desktop" style={{ paddingRight: '5px' }} />
          {$t('Horizontal')}
        </span>
      ),
      key: 'horizontal',
    },
    {
      label: (
        <span>
          <i className="icon-phone-case" style={{ paddingRight: '5px' }} />
          {$t('Vertical')}
        </span>
      ),
      key: 'vertical',
    },
  ];

  const data = p?.tabs ? formatTabs(p.tabs) : dualOutputData;

  function formatTabs(tabs: string[]): ITab[] {
    return tabs.map((tab: string) => ({
      label: $t(tab),
      key: tab,
    }));
  }

  return (
    <AntdTabs defaultActiveKey={data[0].key} onChange={p?.onChange} style={p?.style}>
      {data.map((tab: ITab) => (
        <AntdTabs.TabPane tab={tab.label} key={tab.key} style={p?.tabStyle} />
      ))}
    </AntdTabs>
  );
}
