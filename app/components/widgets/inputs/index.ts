import * as widgetInputComponents from './inputs';
import { inputComponents as sharedInputComponents } from 'components/shared/inputs';

export * from './inputs';

// Widget metadata types and helpers live in services/widgets/widget-input-metadata; re-exported for legacy Vue consumers
export * from 'services/widgets/widget-input-metadata';

export const inputComponents = {
  ...sharedInputComponents,
  ...widgetInputComponents,
};
