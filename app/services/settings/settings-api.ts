import { TObsFormData } from 'components/obs/inputs/ObsInput';

export interface ISettingsSubCategory {
  nameSubCategory: string;
  codeSubCategory?: string;
  parameters: TObsFormData;
}

export type Category =
  | 'General'
  | 'Stream'
  | 'Output'
  | 'Audio'
  | 'Video'
  | 'Hotkeys'
  | 'Advanced'
  | 'Comment'
  | 'SpeechEngine'
  | 'Developer'
  | 'Scene Collections'
  | 'API'
  | 'Notifications'
  | 'Appearance'
  | 'Experimental'
  | 'StreamSecond';

export interface ISettingsServiceApi {
  getCategories(): Category[];
  getSettingsFormData(categoryName: Category): ISettingsSubCategory[];
  setSettings(categoryName: Category, settingsData: ISettingsSubCategory[]): void;
  showSettings(categoryName?: Category): void;
}
