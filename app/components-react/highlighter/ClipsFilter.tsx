import React from 'react';
import { Tabs, Button, Dropdown, Menu } from 'antd';
import { FilterOutlined } from '@ant-design/icons';

const { TabPane } = Tabs;

interface ClipsFilterProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export default function ClipsFilter({ activeFilter, onFilterChange }: ClipsFilterProps) {
  const additionalFiltersMenu = (
    <Menu>
      <Menu.Item key="1">Filter by Duration</Menu.Item>
      <Menu.Item key="2">Filter by Date</Menu.Item>
    </Menu>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px' }}>
      <Tabs activeKey={activeFilter} onChange={onFilterChange} style={{ flex: 1 }}>
        <TabPane tab="All Clips" key="all" />
        <TabPane tab="AI" key="ai" />
        <TabPane tab="Manual" key="manual" />
      </Tabs>
      <Dropdown overlay={additionalFiltersMenu} trigger={['click']}>
        <Button icon={<FilterOutlined />} style={{ marginLeft: 16 }}>
          More Filters
        </Button>
      </Dropdown>
    </div>
  );
}
