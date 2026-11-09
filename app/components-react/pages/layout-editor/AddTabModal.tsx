import React, { useState } from 'react';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { TextInput, CardInput } from 'components-react/shared/inputs';
import { useLayoutEditor } from './hooks';
import Form from 'components-react/shared/inputs/Form';

const ICONS = [
  { value: 'icon-studio', label: 'icon-studio' },
  { value: 'icon-widgets', label: 'icon-widgets' },
  { value: 'icon-settings-3-1', label: 'icon-settings-3-1' },
  { value: 'icon-graph', label: 'icon-graph' },
  { value: 'icon-lock', label: 'icon-lock' },
  { value: 'icon-live-dashboard', label: 'icon-live-dashboard' },
  { value: 'icon-ideas', label: 'icon-ideas' },
  { value: 'icon-wish-list', label: 'icon-wish-list' },
  { value: 'icon-framed-poster', label: 'icon-framed-poster' },
  { value: 'icon-integrations-2', label: 'icon-integrations-2' },
  { value: 'icon-camera', label: 'icon-camera' },
  { value: 'icon-audio', label: 'icon-audio' },
];

export default function AddTabModal() {
  const { LayoutService } = Services;
  const { setShowModal, setCurrentTab } = useLayoutEditor();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  async function createTab() {
    const newTabId = await LayoutService.actions.return.addTab(name, icon);
    setCurrentTab(newTabId);
    setShowModal(false);
  }

  function Footer() {
    return (
      <>
        <button className="button button--default" onClick={() => setShowModal(false)}>
          {$t('Cancel')}
        </button>
        <button
          className="button button--action"
          onClick={createTab}
          disabled={!icon || !name}
          style={{ marginLeft: '8px' }}
        >
          {$t('Save Layout')}
        </button>
      </>
    );
  }

  return (
    <ModalLayout footer={<Footer />} wrapperStyle={{ width: '390px', height: '270px' }}>
      <Form>
        <CardInput
          value={icon}
          onInput={setIcon}
          options={ICONS}
          isIcons={true}
          style={{ borderRadius: 4, margin: 4 }}
          itemWidth={48}
          itemHeight={48}
          nowrap
        />
        <TextInput
          label={$t('Name')}
          value={name}
          onChange={setName}
          style={{ marginTop: '10px', marginLeft: '-80px', marginRight: '3px' }}
          uncontrolled={false}
        />
      </Form>
    </ModalLayout>
  );
}
