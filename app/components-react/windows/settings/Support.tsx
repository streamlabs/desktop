import * as remote from '@electron/remote';
import { Button } from 'antd';
import cx from 'classnames';
import React, { useMemo, useState } from 'react';
import { getOS, OS } from 'util/operating-systems';
import { $t } from '../../../services/i18n';
import { useVuex } from '../../hooks';
import { alertAsync } from '../../modals';
import { Services } from '../../service-provider';
import { SwitchInput, TextInput } from '../../shared/inputs';
import { ObsSettingsSection } from './ObsSettings';
import styles from './Support.m.less';

interface ISupportLink {
  label: string;
  disabled?: boolean;
  icon?: string | React.ReactNode;
  className?: string;
}

interface IBasicSupportLink extends ISupportLink {
  href: string;
}

interface ICustomSupportLink extends ISupportLink {
  onClick: () => void;
}

function isBasicSupportLink(link: ISupportLink): link is IBasicSupportLink {
  return 'href' in link;
}

function openLink(link: string) {
  remote.shell.openExternal(link);
}

type TSupportLink = IBasicSupportLink | ICustomSupportLink;

function SupportLinks(p: { inline?: boolean; links: TSupportLink[] }) {
  return (
    <div className={cx(styles.supportLinks, { [styles.supportLinksInline]: p.inline })}>
      {p.links.map(link => (
        <Button
          key={link.label}
          className={link.className}
          disabled={link.disabled}
          icon={
            typeof link.icon === 'string' ? (
              <i className={link.icon} style={{ marginRight: 8 }} />
            ) : (
              link.icon || <i className="icon-pop-out-2" style={{ marginRight: 8 }} />
            )
          }
          onClick={isBasicSupportLink(link) ? () => openLink(link.href) : link.onClick}
        >
          {link.label}
        </Button>
      ))}
    </div>
  );
}

function QuickfixSection() {
  const { UserService } = Services;
  const { isPrime } = useVuex(() => ({
    isPrime: UserService.views.isPrime,
  }));

  return (
    <ObsSettingsSection title={$t('Fix common issues')} style={{ marginBottom: 20 }}>
      <div className={styles.sectionGrid}>
        {!isPrime && (
          <>
            <h3>{$t('Restore Ultra benefits')}</h3>
            <p>
              {$t(
                'If you subscribed on web, you may need to restore your Ultra membership on desktop.',
              )}
            </p>
            <SupportLinks
              inline
              links={[
                {
                  label: $t('Restore Ultra'),
                  icon: 'icon-ultra',
                  className: styles.restoreUltra,
                  onClick: () => UserService.actions.startSLAuth(),
                },
              ]}
            />
          </>
        )}

        <h3>{$t('Optimize your stream settings')}</h3>
        <p>{$t('Optimize your stream quality with settings that fit your hardware.')}</p>
        <SupportLinks
          inline
          links={[
            {
              label: $t('Stream Settings Guide'),
              href:
                'https://streamlabs.com/content-hub/post/how-to-optimize-your-settings-for-streamlabs-desktop',
            },
          ]}
        />

        <h3>{$t('Optimize your game settings')}</h3>
        <p>{$t('Fine tune your game settings to ensure maximum stream and game performance.')}</p>
        <SupportLinks
          inline
          links={[
            {
              label: $t('Game Settings Guide'),
              href:
                'https://streamlabs.com/content-hub/post/how-to-optimize-game-settings-for-live-streaming',
            },
          ]}
        />
      </div>
    </ObsSettingsSection>
  );
}

function ImportSection() {
  const { HostsService, OnboardingService, UrlService, WindowsService } = Services;
  const { obsImported } = useVuex(() => ({
    obsImported: OnboardingService.state.importedFrom === 'obs',
  }));

  function importFromObs() {
    OnboardingService.actions.setImport('obs');
    OnboardingService.actions.start({ isImport: true });
    WindowsService.actions.closeChildWindow();
  }

  return (
    <ObsSettingsSection title={$t('Import your settings')}>
      <div className={styles.sectionGrid}>
        <h3>{$t('OBS Importer')}</h3>
        {obsImported ? (
          <p>{$t('Import your native OBS settings and sources.')}</p>
        ) : (
          <p>{$t('Import your OBS settings and sources with one click.')}</p>
        )}
        {obsImported ? (
          <SupportLinks
            inline
            links={[
              {
                label: $t('Imported from OBS'),
                icon: 'icon-download',
                disabled: true,
                className: styles.obsImportSuccess,
                onClick: () => {},
              },
            ]}
          />
        ) : (
          <SupportLinks
            inline
            links={[{ label: $t('OBS Import'), icon: 'icon-download', onClick: importFromObs }]}
          />
        )}

        <h3>{$t('Streamelements Importer')}</h3>
        <p>
          {$t(
            'Import your Streamelements overlays, widgets, tip settings, chatbot settings, and loyalty points.',
          )}
        </p>
        <SupportLinks
          inline
          links={[
            {
              label: $t('Streamelements Import'),
              icon: 'icon-download',
              href: `${UrlService.protocol}${HostsService.streamlabs}/dashboard#/import/streamelements`,
            },
          ]}
        />
      </div>
    </ObsSettingsSection>
  );
}

function ContactUsSection() {
  return (
    <ObsSettingsSection title={$t('Contact us')}>
      <p>
        {$t(
          'To enable us to best support you, please complete the reporting steps (below) before closing Streamlabs Desktop.',
        )}
      </p>
      <SupportLinks
        links={[
          {
            label: $t('Submit a ticket'),
            href: 'https://support.streamlabs.com/hc/en-us/requests/new?ticket_form_id=473667',
          },
          {
            label: $t('Community Discord'),
            icon: 'icon-discord',
            href: 'https://discord.gg/stream',
          },
        ]}
      />
    </ObsSettingsSection>
  );
}

function ReportingSection() {
  const { DiagnosticsService, AppService, CacheUploaderService, CustomizationService } = Services;
  const [uploading, setUploading] = useState(false);
  const [cacheUploading, setCacheUploading] = useState(false);

  function uploadReport() {
    setUploading(true);
    DiagnosticsService.actions.return
      .uploadReport()
      .then(r => {
        remote.clipboard.writeText(r.report_code);
        alertAsync({
          icon: (
            <i className={cx('icon-check', styles.diagnosticIcon, styles.diagnosticIconSuccess)} />
          ),
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
          icon: (
            <i className={cx('icon-error', styles.diagnosticIcon, styles.diagnosticIconError)} />
          ),
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

  async function showCacheDir() {
    await remote.shell.openPath(AppService.appDataDirectory);
  }

  async function uploadCacheDir() {
    if (cacheUploading) return;
    setCacheUploading(true);
    try {
      const file = await CacheUploaderService.uploadCache();
      remote.clipboard.writeText(file);
      alert(
        $t(
          'Your cache directory has been successfully uploaded.  The file name %{file} has been copied to your clipboard.',
          { file },
        ),
      );
    } finally {
      setCacheUploading(false);
    }
  }

  const { enableCrashDumps } = useVuex(() => ({
    enableCrashDumps: CustomizationService.state.enableCrashDumps,
  }));

  const CrashReportingSection = useMemo(() => {
    if (getOS() !== OS.Windows) return <></>;
    return (
      <>
        <h3>{$t('Crash Reporting')}</h3>
        <SwitchInput
          layout="horizontal"
          name="enable_dump_upload"
          label={$t('Enable reporting additional information on a crash (requires restart)')}
          value={enableCrashDumps}
          onChange={val => CustomizationService.actions.setSettings({ enableCrashDumps: val })}
        />
      </>
    );
  }, [enableCrashDumps]);

  return (
    <ObsSettingsSection title={$t('Reporting')}>
      <p>
        {$t(
          'The diagnostic report is an automatically generated report that contains information about your system and configuration. Clicking the upload button below will generate and securely transmit a diagnostic report to the Streamlabs team.',
        )}
      </p>
      {useMemo(
        () => (
          <SupportLinks
            links={[
              {
                label: $t('Upload Diagnostic Report'),
                icon: uploading ? 'fa fa-spinner fa-pulse' : 'fa fa-upload',
                disabled: uploading,
                onClick: uploadReport,
              },
            ]}
          />
        ),
        [uploading],
      )}

      <h3>{$t('Cache')}</h3>
      <p>
        {$t(
          'Deleting your cache directory will cause you to lose some settings. Do not delete your cache directory unless instructed to do so by a Streamlabs staff member.',
        )}
      </p>
      <p className={styles.cacheWarning}>
        <i className="icon-error" style={{ marginRight: 8 }} />
        {$t(
          'Do not delete your cache directory unless instructed to do so by a Streamlabs staff member.',
        )}
      </p>
      {useMemo(
        () => (
          <SupportLinks
            links={[
              {
                label: $t('Upload Cache to Developers'),
                icon: cacheUploading ? 'fa fa-spinner fa-spin' : 'fa fa-upload',
                disabled: cacheUploading,
                onClick: uploadCacheDir,
              },
              {
                label: $t('Show Cache Directory'),
                icon: 'icon-view',
                onClick: showCacheDir,
              },
            ]}
          />
        ),
        [cacheUploading],
      )}

      {CrashReportingSection}
    </ObsSettingsSection>
  );
}

export function Support() {
  return (
    <div className={styles.support}>
      <QuickfixSection />
      <ImportSection />
      <ContactUsSection />
      <ReportingSection />
    </div>
  );
}
