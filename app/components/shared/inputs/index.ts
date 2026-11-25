import * as inputs from './inputs';
import { Validator } from 'vee-validate';
import { $t } from 'services/i18n';

export const inputComponents = inputs;

// Metadata types and helpers live in util/input-metadata; re-exported for legacy Vue consumers
export * from 'util/input-metadata';

// rules https://baianat.github.io/vee-validate/guide/rules.html
const validationMessages = {
  en: {
    messages: {
      required: () => $t('The field is required'),
      min_value: (fieldName: string, params: number[]) =>
        $t('The field value must be %{value} or larger', { value: params[0] }),
      max_value: (fieldName: string, params: number[]) =>
        $t('The field value must be %{value} or less', { value: params[0] }),
      date_format: (fieldName: string, params: number[]) =>
        $t('The date must be in %{format} format', { format: params[0] }),
      alpha_num: () => $t('This field may only contain alphabetic characters or numbers'),
      min: (fieldName: string, params: number[]) =>
        $t('This field must be at least %{value} characters.', { value: params[0] }),
      max: (fieldName: string, params: number[]) =>
        $t('This field may not be greater than %{value} characters.', { value: params[0] }),
    },
  },
};

// Override and merge the dictionaries
Validator.localize(validationMessages);
