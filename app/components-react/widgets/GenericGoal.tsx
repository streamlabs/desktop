import React, { useEffect, useRef, useState } from 'react';
import { Button, Menu, message } from 'antd';
import { $t } from 'services/i18n';
import { IWidgetCommonState, useWidget, WidgetModule, WidgetParams } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import Form from 'components-react/shared/inputs/Form';
import { metadata } from '../shared/inputs/metadata';
import { WidgetType } from 'services/widgets';
import { authorizedHeaders, jfetch } from 'util/requests';
import { Services } from 'components-react/service-provider';
import styles from './GenericGoal.m.less';
import { assertIsDefined } from 'util/properties-type-guards';

interface IGoalState extends IWidgetCommonState {
  data: {
    goal: {
      title: string;
      goal_amount: number;
      current_amount: number;
      to_go: string;
    } | null;
    settings: {
      background_color: string;
      bar_color: string;
      bar_bg_color: string;
      text_color: string;
      bar_text_color: string;
      font: string;
      bar_thickness: string;
      layout: string;
      custom_enabled: boolean;
      custom_html: string;
      custom_js: string;
      custom_css: string;
    };
    custom_defaults: {
      html: string;
      js: string;
      css: string;
    };
    has_goal: boolean;
    show_bar: string;
  };
}

export function GenericGoal() {
  const {
    isLoading,
    settings,
    createGoalMeta,
    goalSettings,
    visualMeta,
    updateSetting,
    setSelectedTab,
    selectedTab,
    saveGoal,
    resetGoal,
    type,
  } = useGenericGoal();

  const isCharity = type === WidgetType.CharityGoal;

  const hasGoal = !!goalSettings;

  const [goalCreateValues, setGoalCreateValues] = useState<Dictionary<TInputValue>>({
    title: '',
    goal_amount: 100,
    manual_goal_amount: 0,
    ends_at: '',
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
        <Menu.Item key="general">{$t('Visual Settings')}</Menu.Item>
        {!isCharity && <Menu.Item key="goal">{$t('Goal Settings')}</Menu.Item>}
      </Menu>
      <Form>
        {!isLoading && selectedTab === 'goal' && !hasGoal && (
          <>
            <FormFactory
              metadata={createGoalMeta}
              values={goalCreateValues}
              onChange={updateGoalCreate}
            />
            <Button
              className="button button--action"
              onClick={() => saveGoal(goalCreateValues)}
              style={{ marginBottom: 16 }}
            >
              {$t('Start Goal')}
            </Button>
          </>
        )}
        {!isLoading && selectedTab === 'goal' && hasGoal && (
          <DisplayGoal goal={goalSettings} resetGoal={resetGoal} />
        )}
        {!isLoading && selectedTab === 'general' && (
          <FormFactory
            metadata={visualMeta}
            values={settings}
            onChange={updateSetting}
            name="visualSettingsForm"
          />
        )}
      </Form>
    </WidgetLayout>
  );
}

function DisplayGoal(p: { goal: IGoalState['data']['goal']; resetGoal: () => void }) {
  if (!p.goal) return <></>;
  return (
    <div className="section__body">
      <div className={styles.goalRow}>
        <span>{$t('Title')}</span>
        <span>{p.goal.title}</span>
      </div>
      <div className={styles.goalRow}>
        <span>{$t('Goal Amount')}</span>
        <span>{p.goal.goal_amount}</span>
      </div>
      <div className={styles.goalRow}>
        <span>{$t('Current Amount')}</span>
        <span>{p.goal.current_amount}</span>
      </div>
      <div className={styles.goalRow}>
        <span>{$t('Days Remaining')}</span>
        <span>{p.goal.to_go}</span>
      </div>
      <Button
        className="button button--soft-warning"
        onClick={p.resetGoal}
        style={{ marginBottom: 16 }}
      >
        {$t('End Goal')}
      </Button>
    </div>
  );
}

export class GenericGoalModule extends WidgetModule<IGoalState> {
  get dateValidator() {
    return {
      // regex from https://stackoverflow.com/questions/2520633/what-is-the-mm-dd-yyyy-regular-expression-and-how-do-i-use-it-in-php
      pattern: /^(0[1-9]|1[012])[/](0[1-9]|[12][0-9]|3[01])[/](19|20)\d\d$/,
      message: $t('Must be in MM/DD/YYYY format.'),
    };
  }

  get createGoalMeta() {
    return {
      title: metadata.text({
        label: $t('Title'),
        required: true,
        max: 60,
      }),
      goal_amount: metadata.number({
        label: $t('Goal Amount'),
        required: true,
        min: 1,
      }),
      manual_goal_amount: metadata.number({
        label: $t('Starting Amount'),
        min: 0,
      }),
      ends_at: metadata.text({
        label: $t('End After'),
        required: true,
        placeholder: 'MM/DD/YYYY',
        rules: [this.dateValidator],
      }),
    };
  }

  get goalSettings() {
    return this.widgetData.goal;
  }

  get visualMeta() {
    const meta = {
      layout: metadata.list({
        label: $t('Layout'),
        options: [
          { label: $t('Standard'), value: 'standard' },
          { label: $t('Condensed'), value: 'condensed' },
        ],
      }),
      background_color: metadata.color({ label: $t('Background Color') }),
      bar_color: metadata.color({ label: $t('Bar Color') }),
      bar_bg_color: metadata.color({ label: $t('Bar Background Color') }),
      text_color: metadata.color({
        label: $t('Text Color'),
        tooltip: $t('A hex code for the base text color.'),
      }),
      bar_text_color: metadata.color({ label: $t('Bar Text Color') }),
      bar_thickness: metadata.slider({ label: $t('Bar Thickness'), min: 32, max: 128, step: 4 }),
      font: { type: 'fontFamily', label: $t('Font Family') },
    };

    if (this.state.type === WidgetType.SubGoal) {
      return { include_resubs: metadata.switch({ label: $t('Include Resubs') }), ...meta };
    }
    return meta;
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
      const resp: IGoalState['data'] = await jfetch(
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

  private setGoalData(goal: IGoalState['data']['goal']) {
    assertIsDefined(this.state.widgetData.data);
    this.state.mutate(state => {
      state.widgetData.data.goal = goal;
    });
  }

  patchAfterFetch(data: IGoalState['data']): IGoalState['data'] {
    // fix a bug when API returning an empty array instead of null
    if (Array.isArray(data.goal)) data.goal = null;
    return data;
  }
}

function useGenericGoal() {
  return useWidget<GenericGoalModule>();
}
