import type { Action, ExportedAction } from './actions';
import type { TCondition } from './conditions';

export type TAutomation = {
  id?: number;
  description?: string;
  conditions: TCondition[];
  scenes?: string[];
  actions: Action[];
  enabled: boolean;
};

export type TAutomationExport = {
  id?: number;
  description?: string;
  conditions: TCondition[];
  scenes?: string[];
  actions: ExportedAction[];
  enabled: boolean;
};
