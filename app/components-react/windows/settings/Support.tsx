import React, { useState } from 'react';
import * as remote from '@electron/remote';
import { useVuex } from '../../hooks';
import { Services } from '../../service-provider';
import { alertAsync, confirmAsync } from '../../modals';
import { $t } from '../../../services/i18n';
import { ObsSettingsSection } from './ObsSettings';
import { CheckboxInput, TextInput } from '../../shared/inputs';
import { getOS, OS } from 'util/operating-systems';
import { Button } from 'antd';
import cx from 'classnames';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

export function Support() {
  return (
    <div>
      <SupportLinks />
      <DiagnosticReport />
      <CacheSettings />
      {getOS() === OS.Windows && <CrashReporting />}
    </div>
  );
}

Support.page = 'Get Support';

function SupportLinks() {
  const { UrlService } = Services;
  function openLink(link: string) {
    remote.shell.openExternal(link);
  }

  return (
    <ObsSettingsSection title={$t('Support Links')}>
      <div className="input-container">
        <a className="link" onClick={() => openLink(UrlService.supportLink)}>
          <i className="icon-question" /> <span>{$t('Streamlabs Support')}</span>
        </a>
      </div>
      <div className="input-container">
        <a className="link" onClick={() => openLink('https://discord.gg/stream')}>
          <i className="icon-discord" /> <span>{$t('Community Discord')}</span>
        </a>
      </div>
    </ObsSettingsSection>
  );
}

function DiagnosticReport() {
  const { DiagnosticsService } = Services;
  const [uploading, setUploading] = useState(false);

  function uploadReport() {
    setUploading(true);
    DiagnosticsService.actions.return
      .uploadReport()
      .then(r => {
        remote.clipboard.writeText(r.report_code);
        alertAsync({
          icon: <CheckCircleOutlined style={{ color: 'var(--teal)' }} />,
          width: 550,
          getContainer: '#mainWrapper',
          className: 'react',
          title: $t('Diagnostic Report Uploaded Successfully'),
          content: (
            <div>
              {$t(
                'The diagnostic report was securely uploaded, and the Report ID below has been copied to your clipboard. Please provide the Report ID to the Streamlabs Streamer Success Team.',
              )}
              <TextInput
                readOnly
                style={{ marginTop: 20, marginLeft: -10 }}
                value={r.report_code}
                addonAfter={
                  <Button onClick={() => remote.clipboard.writeText(r.report_code)}>
                    {$t('Copy')}
                  </Button>
                }
              />
            </div>
          ),
        });
      })
      .catch(e => {
        console.error('Error generating diagnostic report', e);

        alertAsync({
          icon: <ExclamationCircleOutlined style={{ color: 'var(--red)' }} />,
          getContainer: '#mainWrapper',
          className: 'react',
          title: $t('Error Uploading Diagnostic Report'),
          content: $t(
            'There was an error uploading the diagnostic report. Please try again, and let the Streamlabs Streamer Success team know if the issue persists.',
          ),
        });
      })
      .finally(() => setUploading(false));
  }

  return (
    <ObsSettingsSection title={$t('Diagnostic Report')}>
      {$t(
        'The diagnostic report is an automatically generated report that contains information about your system and configuration. Clicking the upload button below will generate and securely transmit a diagnostic report to the Streamlabs team.',
      )}
      <Button style={{ margin: '20px 0' }} onClick={uploadReport} disabled={uploading}>
        <i
          className={cx('fa', { 'fa-upload': !uploading, 'fa-spinner fa-pulse': uploading })}
          style={{ marginRight: 8 }}
        />
        {$t('Upload Diagnostic Report')}
      </Button>
    </ObsSettingsSection>
  );
}

function CacheSettings() {
  const { AppService, CacheUploaderService } = Services;
  const [cacheUploading, setCacheUploading] = useState(false);

  async function showCacheDir() {
    await remote.shell.openPath(AppService.appDataDirectory);
  }

  async function deleteCacheDir() {
    if (
      await confirmAsync(
        $t(
          'WARNING! You will lose all stream and encoder settings. If you are logged in, your scenes and sources will be restored from the cloud. This cannot be undone.',
        ),
      )
    ) {
      remote.app.relaunch({ args: ['--clearCacheDir'] });
      remote.app.quit();
    }
  }

  function uploadCacheDir() {
    if (cacheUploading) return;
    setCacheUploading(true);
    CacheUploaderService.uploadCache().then(file => {
      remote.clipboard.writeText(file);
      alert(
        $t(
          'Your cache directory has been successfully uploaded.  ' +
            'The file name %{file} has been copied to your clipboard.',
          { file },
        ),
      );
      setCacheUploading(false);
    });
  }

  return (
    <ObsSettingsSection title={$t('Cache Directory')}>
      <p>
        {$t(
          'Deleting your cache directory will cause you to lose some settings. Do not delete your cache directory unless instructed to do so by a Streamlabs staff member.',
        )}
      </p>
      <div className="input-container">
        <a className="link" onClick={showCacheDir}>
          <i className="icon-view" /> <span>{$t('Show Cache Directory')}</span>
        </a>
      </div>
      <div className="input-container">
        <a className="link" onClick={deleteCacheDir}>
          <i className="icon-trash" />
          <span>{$t('Delete Cache and Restart')}</span>
        </a>
      </div>
      <div className="input-container">
        <a className="link" onClick={uploadCacheDir}>
          <i className="fa fa-upload" /> <span>{$t('Upload Cache to Developers')}</span>
          {cacheUploading && <i className="fa fa-spinner fa-spin" />}
        </a>
      </div>
    </ObsSettingsSection>
  );
}

function CrashReporting() {
  const { CustomizationService } = Services;
  const { enableCrashDumps } = useVuex(() => {
    return { enableCrashDumps: CustomizationService.state.enableCrashDumps };
  });

  return (
    <ObsSettingsSection title={$t('Crash Reporting')}>
      <CheckboxInput
        name="enable_dump_upload"
        label={$t('Enable reporting additional information on a crash (requires restart)')}
        value={enableCrashDumps}
        onChange={val => CustomizationService.actions.setSettings({ enableCrashDumps: val })}
      />
    </ObsSettingsSection>
  );
}
