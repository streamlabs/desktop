import { TPlatform } from '../../../services/platforms';
import React, { useMemo, useCallback } from 'react';
import { InputComponent, TInputLayout } from '../../shared/inputs';
import InputWrapper from '../../shared/inputs/InputWrapper';
import { CheckboxInput } from 'components-react/shared/inputs/CheckboxInput';
import { $t } from 'services/i18n';
import { assertIsDefined } from 'util/properties-type-guards';
import { Services } from 'components-react/service-provider';

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
  value: ICommonPlatformSettings;
  descriptionIsRequired?: boolean;
  enabledPlatformsCount?: number;
  layout?: TInputLayout;
  hasCustomCheckbox?: boolean;
  onChange: (newValue: ICommonPlatformSettings) => unknown;
}

/**
 * Component for modifying common platform fields such as "Title" and "Description"
 * if "props.platform" is provided it changes props for a single platform
 * otherwise it changes props for all enabled platforms
 */
export const CustomFieldsCheckbox = InputComponent((p: IProps) => {
  function updatePlatform(patch: Partial<ICommonPlatformSettings>) {
    const platformSettings = p.value;
    p.onChange({ ...platformSettings, ...patch });
  }

  /**
   * Toggle the "Use different title and description " checkbox
   **/
  const toggleUseCustom = useCallback(() => {
    assertIsDefined(p.platform);
    const isEnabled = p.value.useCustomFields;
    updatePlatform({ useCustomFields: !isEnabled });
  }, [p.platform, p.value.useCustomFields, updatePlatform]);

  // Memoize the values of `hasDescription` to avoid unnecessary re-renders of the component
  // but it never needs to be updated after the first render because supported fields for platforms
  // can't change without updating the service
  const hasDescription = useMemo(
    () =>
      p.platform
        ? Services.StreamingService.views.supports('description', [p.platform])
        : Services.StreamingService.views.supports('description'),
    [],
  );

  // Same as above for `title`
  const title = useMemo(
    () => (hasDescription ? $t('Use different title and description') : $t('Use different title')),
    [],
  );

  const showCheckbox = useMemo(() => {
    return p.enabledPlatformsCount && p.enabledPlatformsCount > 1;
  }, [p.enabledPlatformsCount]);

  const layout = p.layout ?? 'vertical';

  return showCheckbox ? (
    <InputWrapper layout={layout} nolabel>
      <CheckboxInput
        name="customEnabled"
        value={p.value.useCustomFields}
        onChange={toggleUseCustom}
        label={title}
        nolabel
      />
    </InputWrapper>
  ) : (
    <></>
  );
});
