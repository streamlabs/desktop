import React, { useState } from 'react';
import { ObsGenericSettingsForm, ObsSettingsSection } from './ObsSettings';
import { $t, I18nService } from '../../../services/i18n';
import { alertAsync, confirmAsync } from '../../modals';
import { CheckboxInput, ListInput } from '../../shared/inputs';
import { Services } from '../../service-provider';
import fs from 'fs';
import path from 'path';
import { getDefined } from '../../../util/properties-type-guards';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';

export function GeneralSettings() {
  return (
    <div>
      <LanguageSettings />
      <ExtraSettings />
      <ObsGenericSettingsForm page="General" />
    </div>
  );
}

function LanguageSettings() {
  const i18nService = I18nService.instance as I18nService;
  const localeOptions = i18nService.state.localeList;
  const currentLocale = i18nService.state.locale;

  async function save(lang: string) {
    if (!(await confirmAsync('This action will restart the application. Continue?'))) {
      return;
    }
    i18nService.actions.setLocale(lang);
  }

  return (
    <ObsSettingsSection>
      <ListInput options={localeOptions} label={'Language'} onChange={save} value={currentLocale} />
    </ObsSettingsSection>
  );
}

function ExtraSettings() {
  const {
    UserService,
    CustomizationService,
    AppService,
    OnboardingService,
    WindowsService,
    StreamlabelsService,
    RecordingModeService,
  } = Services;
  const isLoggedIn = UserService.isLoggedIn;
  const isFacebook = isLoggedIn && getDefined(UserService.platform).type === 'facebook';
  const isYoutube = isLoggedIn && getDefined(UserService.platform).type === 'youtube';
  const disableHAFilePath = path.join(AppService.appDataDirectory, 'HADisable');
  const [disableHA, setDisableHA] = useState(() => fs.existsSync(disableHAFilePath));

  const { recordingMode } = useVuex(() => ({
    recordingMode: RecordingModeService.views.isRecordingModeEnabled,
  }));

  const updateStreamInfoOnLive = useRealmObject(CustomizationService.state).updateStreamInfoOnLive;

  function restartStreamlabelsSession() {
    StreamlabelsService.restartSession().then(result => {
      if (result) {
        alertAsync($t('Stream Labels session has been successfully restarted!'));
      }
    });
  }

  function configureDefaults() {
    OnboardingService.actions.start({ isHardware: true });
    WindowsService.actions.closeChildWindow();
  }

  function importFromObs() {
    // TODO: there's no check that OBS is installed like in Onboarding
    OnboardingService.actions.setImport('obs');
    OnboardingService.actions.start({ isImport: true });
    WindowsService.actions.closeChildWindow();
  }

  function disableHardwareAcceleration(val: boolean) {
    try {
      if (val) {
        // Touch the file
        fs.closeSync(fs.openSync(disableHAFilePath, 'w'));
        setDisableHA(true);
      } else {
        fs.unlinkSync(disableHAFilePath);
        setDisableHA(false);
      }
    } catch (e: unknown) {
      console.error('Error setting hardware acceleration', e);
    }
  }

  return (
    <>
      <ObsSettingsSection>
        {isLoggedIn && !isFacebook && !isYoutube && (
          <CheckboxInput
            value={updateStreamInfoOnLive}
            onChange={val => CustomizationService.actions.setUpdateStreamInfoOnLive(val)}
            label={$t('Confirm stream title and game before going live')}
            name="stream_info_udpate"
          />
        )}
        <CheckboxInput
          label={$t('Disable hardware acceleration (requires restart)')}
          value={disableHA}
          onChange={disableHardwareAcceleration}
          name="disable_ha"
        />
        <CheckboxInput
          label={$t('Disable live streaming features (Recording Only mode)')}
          value={recordingMode}
          onChange={RecordingModeService.actions.setRecordingMode}
        />

        <div className="actions">
          <div className="input-container">
            <button className="button button--default" onClick={restartStreamlabelsSession}>
              {$t('Restart Stream Labels')}
            </button>
          </div>
        </div>
      </ObsSettingsSection>

      <ObsSettingsSection>
        <div className="actions">
          <div className="input-container">
            <button className="button button--default" onClick={configureDefaults}>
              {$t('Configure Default Devices')}
            </button>
          </div>
          <div className="input-container">
            <button className="button button--default" onClick={importFromObs}>
              {$t('OBS Import')}
            </button>
          </div>
        </div>
      </ObsSettingsSection>
    </>
  );
}
