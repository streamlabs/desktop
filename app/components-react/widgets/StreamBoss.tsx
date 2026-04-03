import React, { useState, useEffect } from 'react';
import { inject } from 'slap';
import { Menu, Button, message } from 'antd';
import { useWidget, WidgetModule } from './common/useWidget';
import { metadata, TInputMetadata } from 'components-react/shared/inputs/metadata';
import { $t } from 'services/i18n';
import { UserService } from 'app-services';
import { TPlatform } from 'services/platforms';
import { WidgetLayout } from './common/WidgetLayout';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import Form from 'components-react/shared/inputs/Form';
import { authorizedHeaders, jfetch } from 'util/requests';
import { assertIsDefined } from 'util/properties-type-guards';
import styles from './GenericGoal.m.less';

interface IStreamBossState {
  data: {
    goal: {
      boss_img: string;
      boss_name: string;
      current_health: number;
      mode: 'fixed' | 'overkill' | 'increment';
      multiplier: number;
      percent: number;
      total_health: number;
    } | null;
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

export function Streamboss() {
  const {
    setSelectedTab,
    selectedTab,
    isLoading,
    settings,
    goalSettings,
    updateSetting,
    resetGoal,
    saveGoal,
    visualMeta,
    goalMeta,
    battleMeta,
  } = useStreamboss();

  const hasGoal = !!goalSettings;

  const [goalCreateValues, setGoalCreateValues] = useState<Dictionary<TInputValue>>({
    total_health: 0,
    mode: 'fixed',
    overkill_multiplier: 0,
    overkill_min: 0,
    incr_amount: 0,
  });

  useEffect(() => {
    message.config({ top: 270 });
  }, []);

  function updateGoalCreate(key: string) {
    return (val: TInputValue) => {
      setGoalCreateValues({ ...goalCreateValues, [key]: val });
    };
  }

  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="goal">{$t('Goal')}</Menu.Item>
        <Menu.Item key="battle">{$t('Manage Battle')}</Menu.Item>
        <Menu.Item key="visual">{$t('Visual Settings')}</Menu.Item>
      </Menu>
      <Form>
        {!isLoading && selectedTab === 'goal' && !hasGoal && (
          <>
            <FormFactory
              metadata={goalMeta}
              values={goalCreateValues}
              onChange={updateGoalCreate}
            />
            <Button
              className="button button--action"
              onClick={() => saveGoal(goalCreateValues)}
              style={{ marginBottom: 16 }}
            >
              {$t('Set Stream Boss Health')}
            </Button>
          </>
        )}
        {!isLoading && selectedTab === 'goal' && hasGoal && (
          <DisplayGoal goal={goalSettings} resetGoal={resetGoal} />
        )}
        {!isLoading && selectedTab === 'battle' && (
          <FormFactory metadata={battleMeta} values={settings} onChange={updateSetting} />
        )}
        {!isLoading && selectedTab === 'visual' && (
          <FormFactory metadata={visualMeta} values={settings} onChange={updateSetting} />
        )}
      </Form>
    </WidgetLayout>
  );
}

function DisplayGoal(p: { goal: IStreamBossState['data']['goal']; resetGoal: () => void }) {
  if (!p.goal) return <></>;
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
      <Button
        className="button button--soft-warning"
        onClick={p.resetGoal}
        style={{ marginBottom: 16 }}
      >
        {$t('Reset Boss')}
      </Button>
    </div>
  );
}

export class StreambossModule extends WidgetModule<IStreamBossState> {
  userService = inject(UserService);

  get visualMeta() {
    return {
      skin: metadata.list({
        label: $t('Theme'),
        options: [
          { value: 'default', label: 'Default' },
          { value: 'future', label: 'Future' },
          { value: 'noimg', label: 'No Image' },
          { value: 'pill', label: 'Slim' },
          { value: 'future-curve', label: 'Curved' },
        ],
      }),
      kill_animation: metadata.animation({ label: $t('Kill Animation') }),
      bg_transparent: metadata.bool({ label: $t('Transparent Background') }),
      background_color: metadata.color({ label: $t('Background Color') }),
      text_color: metadata.color({ label: $t('Text Color') }),
      bar_text_color: metadata.color({ label: $t('Health Text Color') }),
      bar_color: metadata.color({ label: $t('Health Bar Color') }),
      bar_bg_color: metadata.color({ label: $t('Health Bar Background Color') }),
      font: metadata.fontFamily({ label: $t('Font') }),
    };
  }

  get battleMeta() {
    return {
      fade_time: metadata.slider({
        label: $t('Fade Time (s)'),
        min: 0,
        max: 20,
        tooltip: $t('Set to 0 to always appear on screen'),
      }),
      boss_heal: metadata.bool({ label: $t('Damage From Boss Heals') }),
      ...this.multipliersByPlatform(),
    };
  }

  get goalMeta() {
    return {
      total_health: metadata.number({ label: $t('Starting Health'), required: true, min: 0 }),
      mode: metadata.list({
        label: $t('Mode'),
        options: [
          {
            label: $t('Fixed'),
            value: 'fixed',
            description: $t('The boss will spawn with the set amount of health everytime.'),
          },
          {
            label: $t('Incremental'),
            value: 'incremental',
            description: $t(
              'The boss will have additional health each time he is defeated. The amount is set below.',
            ),
          },
          {
            label: $t('Overkill'),
            value: 'overkill',
            description: $t(
              "The boss' health will change depending on how much damage is dealt on the killing blow. Excess damage multiplied by the multiplier will be the boss' new health. I.e. 150 damage with 100 health remaining and a set multiplier of 3 would result in the new boss having 150 health on spawn. \n Set your multiplier below.",
            ),
          },
        ],
        children: {
          overkill_multiplier: metadata.number({
            label: $t('Overkill Multiplier'),
            displayed: this.widgetData.goal?.mode === 'overkill',
          }),
          overkill_min: metadata.number({
            label: $t('Overkill Min Health'),
            displayed: this.widgetData.goal?.mode === 'overkill',
          }),
          incr_amount: metadata.number({
            label: $t('Increment Amount'),
            displayed: this.widgetData.goal?.mode === 'increment',
          }),
        },
      }),
    };
  }

  multipliersByPlatform(): Dictionary<TInputMetadata> {
    const platform = this.userService.platform?.type as Exclude<
      TPlatform,
      'tiktok' | 'twitter' | 'instagram' | 'kick'
    >;
    return {
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
    }[platform];
  }

  get goalSettings() {
    return this.widgetData.goal;
  }

  get headers() {
    return authorizedHeaders(
      this.userService.apiToken,
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

  private setGoalData(goal: IStreamBossState['data']['goal']) {
    assertIsDefined(this.state.widgetData.data);
    this.state.mutate(state => {
      state.widgetData.data.goal = goal;
    });
  }
}

function useStreamboss() {
  return useWidget<StreambossModule>();
}
