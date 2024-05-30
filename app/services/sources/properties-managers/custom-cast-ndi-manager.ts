import {
  IObsListInput,
  IObsTextInputValue,
  TObsFormData,
  TObsValue,
  IObsButtonInputValue,
} from 'components/obs/inputs/ObsInput';
import { PropertiesManager } from './properties-manager';
import { $t } from 'services/i18n';

export class CustomCastNdiManager extends PropertiesManager {
  getPropertiesFormData(): TObsFormData {
    const propArray = super.getPropertiesFormData();
    const ndiSourceNameProp = propArray.find(
      prop => prop.name === 'ndi_source_name',
    ) as IObsListInput<TObsValue>;

    if (ndiSourceNameProp !== undefined) {
      // NDIソース選択を禁止する
      ndiSourceNameProp.enabled = false;

      const re = /.* \(CUSTOMCAST\)/;
      const customCastNdi = ndiSourceNameProp.options.find(option => {
        return typeof option.value === 'string' && option.value.match(re);
      });

      if (customCastNdi === undefined) {
        // CUSTOMCAST NDIが見つからないときは案内メッセージを付ける
        const staticText = (name: string, description: string) => {
          return {
            type: 'OBS_PROPERTY_TEXT',
            name,
            description,
            visible: true,
            multiline: false,
            info: true,
          } as IObsTextInputValue;
        };
        const linkButton = (name: string, description: string, url: string) => {
          return {
            type: 'NAIR_PROPERTY_LINK_BUTTON',
            name,
            description,
            visible: true,
            multiline: false,
            info: true,
            url,
          } as IObsButtonInputValue;
        };
        return [
          staticText(
            'custom_cast_ndi_not_found',
            $t('source-props.custom_cast_ndi_source.custom_cast_ndi_not_found'),
          ),
          staticText(
            'custom_cast_ndi_not_found_2',
            $t('source-props.custom_cast_ndi_source.custom_cast_ndi_not_found_2'),
          ),
          linkButton(
            'network_help_button',
            $t('source-props.custom_cast_ndi_source.network_help_button.name'),
            $t('source-props.custom_cast_ndi_source.network_help_button.url'),
          ),
        ];
      }

      // CUSTOMCAST NDIを強制選択する
      const ndi_source_name = customCastNdi.value;
      if (this.obsSource.settings['ndi_source_name'].value !== ndi_source_name) {
        this.obsSource.update({ ndi_source_name });
      }
    }
    return propArray;
  }
}
