import { TPlatform } from '../../../services/platforms';
import { $t } from '../../../services/i18n';
import React, { useMemo } from 'react';
import { InputComponent, TextAreaInput, TextInput, TInputLayout } from '../../shared/inputs';
import { TLayoutMode } from './platforms/PlatformSettingsLayout';
import { Services } from '../../service-provider';
import { Tooltip } from 'antd';
import AnimatedWrapper from 'components-react/shared/AnimatedWrapper';

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

  const fields = p.value;

  const height = useMemo(() => {
    if (!fieldsAreVisible) {
      return '0px';
    }

    if (hasDescription) {
      return '162px';
    }

    return '71px';
  }, [fieldsAreVisible, hasDescription]);

  // determine max character length for title by enabled platform limitation
  let maxCharacters = 120;
  const enabledPlatforms = view.enabledPlatforms;
  if (enabledPlatforms.includes('youtube')) {
    maxCharacters = 100;
  } else if (enabledPlatforms.includes('twitch')) {
    maxCharacters = 140;
  }

  // Patreon requires both a title and description of at least 3 characters,
  // but other platforms do not have a minimum character requirement for title or description
  const hasPatreon = p.platform === 'patreon' || enabledPlatforms.includes('patreon');
  const minCharacters = hasPatreon ? 3 : undefined;

  const titleTooltip = useMemo(() => {
    if (hasPatreon) {
      return $t('Patreon requires a title of at least 3 characters');
    }

    if (enabledPlatforms.includes('tiktok')) {
      return $t('Only 32 characters of your title will display on TikTok');
    }

    return undefined;
  }, [enabledPlatforms]);

  return (
    <AnimatedWrapper
      visible={fieldsAreVisible}
      style={{ marginBottom: p.platform && fieldsAreVisible ? '10px' : '0px' }}
      height={height}
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
        required={true}
        max={maxCharacters}
        min={minCharacters}
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
          min={minCharacters}
          layout={p.layout}
        />
      )}
    </AnimatedWrapper>
  );
});
