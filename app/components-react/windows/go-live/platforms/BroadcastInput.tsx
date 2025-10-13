import React from 'react';
import { $t } from '../../../../services/i18n';
import * as moment from 'moment';
import css from './BroadcastInput.m.less';
import cx from 'classnames';
import { IYoutubeLiveBroadcast } from '../../../../services/platforms/youtube';
import { ListInput, IInputCommonProps } from '../../../shared/inputs';
import { FormItemProps } from 'antd/lib/form';
import { SelectProps } from 'antd/lib/select';
import { IListOption } from '../../../shared/inputs/ListInput';
import { assertIsDefined } from '../../../../util/properties-type-guards';
import { Col, Row } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
const PlusIcon = PlusOutlined as Function;

const textOverflowStyle = { overflow: 'hidden', textOverflow: 'ellipsis' };

/**
 * Broadcast-selector for Youtube
 */
export default function BroadcastInput(
  p: { broadcasts: IYoutubeLiveBroadcast[] } & Omit<SelectProps<string>, 'options'> &
    IInputCommonProps<string> &
    FormItemProps,
) {
  const imageStyle = { width: '60px', minWidth: '60px', height: '44px', borderRadius: '2px' };
  const centerFlexStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const options = [
    {
      label: $t('Create New Event'),
      value: '',
    },
    ...p.broadcasts.map(b => ({ label: b.snippet.title, value: b.id })),
  ];
  /**
   * format the isoDate to the locale-dependent format
   */
  function formatDate(isoDate: string): string {
    return moment(new Date(isoDate)).format(moment.localeData().longDateFormat('ll'));
  }

  function getBroadcast(id: string) {
    return p.broadcasts.find(b => b.id === id);
  }

  function optionRender(opt: IListOption<string>) {
    if (!opt.value) return renderEmptyOption();
    const broadcast = getBroadcast(opt.value);
    assertIsDefined(broadcast);
    return (
      <Row style={{ height: '60px' }} gutter={8} wrap={false} align="middle">
        <Col>
          <img src={broadcast.snippet.thumbnails.default.url} style={imageStyle} />
        </Col>
        <Col flex="auto">
          <div style={textOverflowStyle}>{broadcast.snippet.title}</div>
          <div style={textOverflowStyle}>{broadcast.snippet.description}</div>
        </Col>
        <Col flex="80px">
          <div>{formatDate(broadcast.snippet.scheduledStartTime)}</div>
          <div>&nbsp;</div>
        </Col>
      </Row>
    );
  }

  function renderEmptyOption() {
    return (
      <Row style={{ height: '60px' }} gutter={8} wrap={false} align="middle">
        <Col>
          <div
            style={{ ...imageStyle, ...centerFlexStyle }}
            className={'ant-upload ant-upload-select ant-upload-select-picture-card'}
          >
            <PlusIcon />
          </div>
        </Col>
        <Col flex="auto">{$t('Create New Event')}</Col>
      </Row>
    );
  }

  function labelRender(opt: IListOption<string>) {
    if (!opt.value) return opt.label;
    const broadcast = getBroadcast(opt.value);
    assertIsDefined(broadcast);
    return `${opt.label} (${formatDate(broadcast.snippet.scheduledStartTime)})`;
  }

  return (
    <ListInput
      {...p}
      onChange={p.onChange}
      options={options}
      placeholder={$t('Create New Event')}
      optionRender={optionRender}
      labelRender={labelRender}
      showSearch
    />
  );
}
