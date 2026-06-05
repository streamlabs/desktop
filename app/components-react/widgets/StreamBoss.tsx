import React, { useState } from 'react';
import { Button, Menu, message } from 'antd';
import { $t } from 'services/i18n';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import Form from 'components-react/shared/inputs/Form';
import { IBaseMetadata, metadata } from '../shared/inputs/metadata';
import { authorizedHeaders, jfetch } from 'util/requests';
import { Services } from 'components-react/service-provider';
import { assertIsDefined } from 'util/properties-type-guards';
import { TPlatform } from 'services/platforms';
import styles from './GenericGoal.m.less';

type TStreamBossMode = 'fixed' | 'incremental' | 'overkill';

interface IStreamBossGoal {
  boss_img: string;
  boss_name: string;
  current_health: number;
  mode: TStreamBossMode;
  multiplier: 1;
  percent: number;
  total_health: number;
}

type TStreamBossGoalSetting = keyof IStreamBossGoal;
type TStreamBossGoalMeta = PartialRec<TStreamBossGoalSetting | `_${string}`, IBaseMetadata>;

function fromGoalMeta(meta: TStreamBossGoalMeta): Dictionary<IBaseMetadata> {
  return meta as Dictionary<IBaseMetadata>;
}

interface IStreamBossState extends IWidgetCommonState {
  data: {
    goal: IStreamBossGoal | null;
    settings: {
      background_color: string;
      bar_bg_color: string;
      bar_color: string;
      bar_text_color: string;
      bg_transparent: boolean;
      bit_multiplier: number;
      boss_heal: boolean;
      donation_multiplier: boolean;
      fade_time: number;
      follow_multiplier: boolean;
      font: string;
      incr_amount: string;
      kill_animation: string;
      overkill_min: number;
      overkill_multiplier: number;
      skin: string;
      sub_multiplier: number;
      superchat_multiplier: number;
      text_color: string;
    };
  };
}

type TStreamBossSettings = IStreamBossState['data']['settings'];
type TStreamBossSetting = keyof TStreamBossSettings;
type TStreamBossMeta = PartialRec<TStreamBossSetting | 'themes' | `_${string}`, IBaseMetadata>;

function fromMeta(meta: TStreamBossMeta): Dictionary<IBaseMetadata> {
  return meta as Dictionary<IBaseMetadata>;
}

export function StreamBoss() {
  const {
    settings,
    goalSettings,
    bossMeta,
    visualMeta,
    multipliersMeta,
    bossGoalMeta,
    bossModeMeta,
    hasLoadedSettings,
    updateSetting,
    setSelectedTab,
    selectedTab,
    saveGoal,
    resetGoal,
  } = useStreamBoss();

  const hasGoal = !!goalSettings;

  const [bossCreateValues, setBossCreateValues] = useState<
    Pick<IStreamBossGoal, 'total_health' | 'mode'>
  >({
    total_health: 4800,
    mode: 'fixed',
  });

  function updateBossCreate(key: string) {
    return (val: TInputValue) => {
      setBossCreateValues({ ...bossCreateValues, [key]: val });
    };
  }

  const mode = bossCreateValues.mode as TStreamBossMode;

  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="goal">{$t('Manage Battle')}</Menu.Item>
        <Menu.Item key="general">{$t('Boss Settings')}</Menu.Item>
        <Menu.Item key="visual">{$t('Visual Settings')}</Menu.Item>
      </Menu>
      <Form>
        {hasLoadedSettings(settings) &&
          selectedTab === 'goal' &&
          (hasGoal ? (
            <BossDisplay goal={goalSettings} resetGoal={resetGoal} />
          ) : (
            <>
              <FormFactory
                metadata={bossGoalMeta}
                values={bossCreateValues}
                onChange={updateBossCreate}
              />
              <FormFactory
                metadata={bossModeMeta(mode)}
                values={settings}
                onChange={updateSetting}
              />
              <Button
                className="button button--action"
                onClick={() => saveGoal(bossCreateValues)}
                style={{ marginBottom: 16 }}
              >
                {$t('Set Stream Boss Health')}
              </Button>
            </>
          ))}
        {hasLoadedSettings(settings) && selectedTab === 'general' && (
          <>
            <FormFactory metadata={bossMeta} values={settings} onChange={updateSetting} />
            <FormFactory metadata={multipliersMeta} values={settings} onChange={updateSetting} />
          </>
        )}
        {hasLoadedSettings(settings) && selectedTab === 'visual' && (
          <FormFactory metadata={visualMeta} values={settings} onChange={updateSetting} />
        )}
      </Form>
    </WidgetLayout>
  );
}

function BossDisplay(p: { goal: IStreamBossGoal; resetGoal: () => void }) {
  return (
    <div className="section__body">
      <div className={styles.goalRow}>
        <span>{$t('Current Boss Name')}</span>
        <span>{p.goal.boss_name}</span>
      </div>
      <div className={styles.goalRow}>
        <span>{$t('Total Health')}</span>
        <span>{p.goal.total_health}</span>
      </div>
      <div className={styles.goalRow}>
        <span>{$t('Current Health')}</span>
        <span>{p.goal.current_health}</span>
      </div>
      <div className={styles.goalRow}>
        <span>{$t('Mode')}</span>
        <span>{p.goal.mode}</span>
      </div>
      <Button className="button button--warn" onClick={p.resetGoal} style={{ marginBottom: 16 }}>
        {$t('Reset Stream Boss')}
      </Button>
    </div>
  );
}

export class StreamBossModule extends WidgetModule<IStreamBossState> {
  get UserService() {
    return Services.UserService;
  }

  get goalSettings() {
    return this.widgetData.goal;
  }

  get bossGoalMeta() {
    return fromGoalMeta({
      total_health: metadata.number({
        label: $t('Starting Health'),
        required: true,
        min: 0,
      }),
      mode: metadata.list({
        label: $t('Mode'),
        options: [
          {
            label: $t('Fixed'),
            value: 'fixed',
          },
          {
            label: $t('Incremental'),
            value: 'incremental',
          },
          {
            label: $t('Overkill'),
            value: 'overkill',
          },
        ],
      }),
    });
  }

  bossModeMeta(mode: TStreamBossMode) {
    if (mode === 'incremental') {
      return fromMeta({ incr_amount: metadata.number({ label: $t('Increment Amount') }) });
    } else if (mode === 'overkill') {
      return fromMeta({
        overkill_multiplier: metadata.number({ label: $t('Overkill Multiplier') }),
        overkill_min: metadata.number({ label: $t('Overkill Min Health') }),
      });
    } else {
      return fromMeta({});
    }
  }

  get bossMeta() {
    return fromMeta({
      fade_time: metadata.slider({
        label: $t('Fade Time (s)'),
        min: 0,
        max: 20,
      }),
      boss_heal: metadata.bool({ label: $t('Damage From Boss Heals') }),
      skin: metadata.list({
        label: $t('Theme'),
        options: [
          { label: 'Default', value: 'default' },
          { label: 'Future', value: 'future' },
          { label: 'No Image', value: 'noimg' },
          { label: 'Slim', value: 'pill' },
          { label: 'Curved', value: 'future-curve' },
        ],
      }),
    });
  }

  get multipliersMeta() {
    const platform = this.UserService.views.platform?.type;
    const platformMultipliers: PartialRec<TPlatform, TStreamBossMeta> = {
      twitch: {
        bit_multiplier: metadata.number({ label: $t('Damage Per Bit') }),
        sub_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
        follow_multiplier: metadata.number({ label: $t('Damage Per Follower') }),
      },
      facebook: {
        follow_multiplier: metadata.number({ label: $t('Damage Per Follower') }),
        sub_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
      },
      youtube: {
        sub_multiplier: metadata.number({ label: $t('Damage Per Membership') }),
        superchat_multiplier: metadata.number({ label: $t('Damage Per Superchat Dollar') }),
        follow_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
      },
      trovo: {
        sub_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
        follow_multiplier: metadata.number({ label: $t('Damage Per Follower') }),
      },
    };

    return fromMeta({
      ...(platform && platformMultipliers[platform] ? platformMultipliers[platform] : {}),
      donation_multiplier: metadata.number({ label: $t('Damage Per Dollar Donation') }),
    });
  }

  get visualMeta() {
    return fromMeta({
      kill_animation: metadata.animation({ label: $t('Kill Animation') }),
      bg_transparent: metadata.bool({ label: $t('Transparent Background') }),
      background_color: metadata.color({ label: $t('Background Color') }),
      text_color: metadata.color({ label: $t('Text Color') }),
      bar_text_color: metadata.color({ label: $t('Health Text Color') }),
      bar_color: metadata.color({ label: $t('Health Bar Color') }),
      bar_bg_color: metadata.color({ label: $t('Health Bar Background Color') }),
      font: { type: 'fontFamily', label: $t('Font') },
    });
  }

  get headers() {
    return authorizedHeaders(
      Services.UserService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
  }

  resetGoal() {
    const url = this.config.goalUrl;
    if (!url) return;
    jfetch(new Request(url, { method: 'DELETE', headers: this.headers }));
    this.setGoalData(null);
  }

  async saveGoal(options: Dictionary<TInputValue>) {
    const url = this.config.goalUrl;
    if (!url) return;
    try {
      const resp: IStreamBossState['data'] = await jfetch(
        new Request(url, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(options),
        }),
      );
      this.setGoalData(resp.goal);
    } catch (e: unknown) {
      message.error({ content: (e as any).result.message, duration: 2 });
    }
  }

  private setGoalData(goal: IStreamBossGoal | null) {
    assertIsDefined(this.state.widgetData.data);
    this.state.mutate(state => {
      state.widgetData.data.goal = goal;
    });
  }

  patchAfterFetch(data: IStreamBossState['data']): IStreamBossState['data'] {
    if (Array.isArray(data.goal)) data.goal = null;
    return data;
  }
}

function useStreamBoss() {
  return useWidget<StreamBossModule>();
}
