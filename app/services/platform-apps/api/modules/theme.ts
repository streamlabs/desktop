import { Module, apiMethod, apiEvent, EApiPermissions } from './module';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { Subject } from 'rxjs';

enum ETheme {
  Day = 'day',
  Night = 'night',
}

const themeTable = {
  'day-theme': ETheme.Day,
  'night-theme': ETheme.Night,
};

export class ThemeModule extends Module {
  moduleName = 'Theme';
  permissions: EApiPermissions[] = [];

  @Inject() customizationService: CustomizationService;

  constructor() {
    super();

    this.customizationService.settingsChanged.subscribe(patch => {
      if (patch.theme != null) {
        this.themeChanged.next(themeTable[patch.theme]);
      }
    });
  }

  @apiEvent()
  themeChanged = new Subject<ETheme>();

  @apiMethod()
  getTheme(): ETheme {
    return themeTable[this.customizationService.currentTheme];
  }
}
