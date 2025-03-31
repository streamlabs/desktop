import { TagsInput, TSlobsInputProps } from '../../../shared/inputs';
import { Tag } from 'antd';
import { Services } from '../../../service-provider';
import React from 'react';
import { $t } from '../../../../services/i18n';
import { useVuex } from 'components-react/hooks';

type TTwitchTagsInputProps = TSlobsInputProps<{}, string[]>;

export function TwitchTagsInput(p: TTwitchTagsInputProps) {
  const { TwitchService, OnboardingService, WindowsService } = Services;
  const { tags, hasTagsScope } = useVuex(() => ({
    tags: TwitchService.state.settings.tags,
    hasTagsScope: TwitchService.state.hasUpdateTagsPermission,
  }));

  function reauth() {
    OnboardingService.actions.start({ isLogin: true });
    WindowsService.closeChildWindow();
  }

  if (!hasTagsScope) {
    return (
      <a onClick={() => reauth()} style={{ marginBottom: '8px', display: 'block' }}>
        {$t('You need to re-login to access Twitch tags')}
      </a>
    );
  }

  function specialCharacterValidator(rule: unknown, values: string[], callback: Function) {
    /*
     * Allow letters, numbers, accent marks, disallow special characters.
     * https://help.twitch.tv/s/article/guide-to-tags?language=en_US
     */
    if (values.some(tag => !/^[\p{L}\p{N}\p{M}]+$/u.test(tag))) {
      callback($t('Do not include special characters or spaces in your tag'));
    } else {
      callback();
    }
  }

  return (
    <TagsInput
      name="twitchTags"
      label={p.label}
      value={tags}
      max={10}
      mode="tags"
      onChange={values => p.onChange && p.onChange(values)}
      tagRender={(tagProps, tag) => (
        <Tag {...tagProps} color="#9146FF">
          {tag.label}
        </Tag>
      )}
      rules={[{ validator: specialCharacterValidator }]}
      placeholder={$t('For example: "Speedrunning" or "FirstPlaythrough"')}
      tokenSeparators={[' ', ',']}
      dropdownStyle={{ display: 'none' }}
    />
  );
}
