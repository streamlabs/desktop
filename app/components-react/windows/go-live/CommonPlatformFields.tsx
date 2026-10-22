import { TPlatform } from '../../../services/platforms';
import { $t } from '../../../services/i18n';
import React, { useMemo } from 'react';
import { InputComponent, TextAreaInput, TextInput, TInputLayout } from '../../shared/inputs';
import { TLayoutMode } from './platforms/PlatformSettingsLayout';
import { Services } from '../../service-provider';
import { Tooltip } from 'antd';
import { Rule } from 'antd/lib/form';
import AnimatedWrapper from 'components-react/shared/AnimatedWrapper';
import { useGoLiveSettings } from './useGoLiveSettings';

interface ICommonPlatformSettings {
  title: string;
  description?: string;
  useCustomFields?: boolean;
}

interface IProps {
  /**
   * if provided then change props only for the provided platform
   */
  platform?: TPlatform;
  layoutMode?: TLayoutMode;
  value: ICommonPlatformSettings;
  descriptionIsRequired?: boolean;
  enabledPlatforms?: TPlatform[];
  layout?: TInputLayout;
  onChange: (newValue: ICommonPlatformSettings) => unknown;
}

type TCustomFieldName = 'title' | 'description';

/**
 * Component for modifying common platform fields such as "Title" and "Description"
 * if "props.platform" is provided it changes props for a single platform
 * otherwise it changes props for all enabled platforms
 */
export const CommonPlatformFields = InputComponent((rawProps: IProps) => {
  const defaultProps = { layoutMode: 'singlePlatform' as TLayoutMode };
  const p: IProps = { ...defaultProps, ...rawProps };

  function updatePlatform(patch: Partial<ICommonPlatformSettings>) {
    const platformSettings = p.value;
    p.onChange({ ...platformSettings, ...patch });
  }

  function updateCommonField(fieldName: TCustomFieldName, value: string) {
    updatePlatform({ [fieldName]: value });
  }

  /**
   * Minimum length counted in visible characters. Descriptions are prefilled with a trailing newline,
   * which antd's `min` rule counts, so a field that looks 2 characters long would pass a minimum of 3.
   */
  function minVisibleCharsRule(min: number, message: string): Rule {
    return {
      validateTrigger: 'onChange',
      validator: (rule, value?: string) =>
        (value ?? '').trim().length >= min ? Promise.resolve() : Promise.reject(new Error(message)),
    };
  }

  const view = Services.StreamingService.views;
  const fieldsAreVisible = useMemo(() => {
    if (p.layoutMode === 'singlePlatform') return true;
    return !p.platform || p.value.useCustomFields || false;
  }, [p.layoutMode, p.platform, p.value.useCustomFields]);
  const descriptionIsRequired =
    typeof p.descriptionIsRequired === 'boolean'
      ? p.descriptionIsRequired
      : p.platform === 'facebook';

  const hasDescription = p.platform
    ? view.supports('description', [p.platform as TPlatform])
    : view.supports('description');

  // Only the shared instance can run out of platforms to write to, and only while live, where
  // `updateCommonFields` skips any platform using its own title. Once every enabled platform has
  // opted out, editing the shared title changes nothing.
  const titleDisabled =
    !p.platform &&
    view.isMidStreamMode &&
    view.enabledPlatforms.length > 0 &&
    !view.platformsWithoutCustomFields.length;

  const { settings } = useGoLiveSettings();
  const fields = p.value;
  const enabledPlatforms = view.enabledPlatforms;

  // A single platform's instance validates that platform's limits only, the shared instance
  // validates every enabled platform
  const targetPlatforms = useMemo(() => (p.platform ? [p.platform] : enabledPlatforms), [
    p.platform,
    enabledPlatforms,
  ]);
  const isYouTubeDualStream =
    targetPlatforms.includes('youtube') && settings.platforms['youtube']?.display === 'both';
  const hasPatreon = targetPlatforms.includes('patreon');
  const minTitleChars = hasPatreon ? 3 : undefined;
  const minDescriptionChars = hasPatreon ? 3 : undefined;

  const maxTitleChars = useMemo(() => {
    // 100 minus the 11 characters of the " (Portrait)" suffix added to the vertical broadcast
    if (isYouTubeDualStream) return 89;
    if (targetPlatforms.includes('youtube')) return 100;
    if (targetPlatforms.includes('twitch')) return 140;
    return undefined;
  }, [isYouTubeDualStream, targetPlatforms]);

  const titleRules = useMemo(() => {
    const rules: Rule[] = [];
    const maxRule = { max: maxTitleChars, validateTrigger: 'onChange' };
    const value = maxTitleChars;

    if (isYouTubeDualStream) {
      rules.push({
        ...maxRule,
        message: $t(
          'YouTube Dual Stream title limited to %{value} characters (includes " (Portrait)" suffix)',
          { value },
        ),
      });
    } else if (targetPlatforms.includes('youtube')) {
      rules.push({
        ...maxRule,
        message: $t('YouTube title limited to %{value} characters', { value }),
      });
    } else if (targetPlatforms.includes('twitch')) {
      rules.push({
        ...maxRule,
        message: $t('Twitch title limited to %{value} characters', { value }),
      });
    } else {
      rules.push({
        ...maxRule,
        message: $t('This field may not be greater than %{value} characters.', { value }),
      });
    }

    if (minTitleChars) {
      rules.push(
        minVisibleCharsRule(
          minTitleChars,
          $t('Patreon requires a title of at least %{value} characters', { value: minTitleChars }),
        ),
      );
    }

    return rules;
  }, [isYouTubeDualStream, targetPlatforms, maxTitleChars, minTitleChars]);

  const descriptionRules = useMemo(() => {
    if (!minDescriptionChars) return undefined;

    return [
      minVisibleCharsRule(
        minDescriptionChars,
        $t('Patreon requires a description of at least %{value} characters', {
          value: minDescriptionChars,
        }),
      ),
    ];
  }, [minDescriptionChars]);

  const titleTooltip = useMemo(() => {
    if (minTitleChars) {
      return $t('Patreon requires a title of at least %{value} characters', {
        value: minTitleChars,
      });
    }

    if (targetPlatforms.includes('tiktok')) {
      return $t('Only 32 characters of your title will display on TikTok');
    }

    return undefined;
  }, [minTitleChars, targetPlatforms]);

  return (
    <AnimatedWrapper
      visible={fieldsAreVisible}
      style={{ marginBottom: p.platform && fieldsAreVisible ? '10px' : '0px' }}
    >
      {/*TITLE*/}
      <TextInput
        value={fields['title']}
        name="title"
        onChange={val => updateCommonField('title', val)}
        label={
          titleTooltip ? (
            <Tooltip title={titleTooltip} placement="right">
              {$t('Title')}
              <i className="icon-information" style={{ marginLeft: '5px' }} />
            </Tooltip>
          ) : (
            $t('Title')
          )
        }
        // A disabled input cannot be corrected, so it must not be able to fail validation. Each
        // platform using its own title validates that title in its own section.
        required={!titleDisabled}
        disabled={titleDisabled}
        rules={titleDisabled ? undefined : titleRules}
        layout={p.layout}
        style={{ marginTop: !p.platform ? '0px' : '10px' }}
        size="large"
      />

      {/*DESCRIPTION*/}
      {hasDescription && (
        <TextAreaInput
          value={fields['description']}
          onChange={val => updateCommonField('description', val)}
          name="description"
          label={$t('Description')}
          required={descriptionIsRequired}
          rules={descriptionRules}
          layout={p.layout}
        />
      )}
    </AnimatedWrapper>
  );
});
