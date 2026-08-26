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
  'prime-light': ETheme.Day,
  'prime-dark': ETheme.Night,
  'golive-day-theme': ETheme.Day,
  'golive-night-theme': ETheme.Night,
  'golive-prime-light': ETheme.Day,
  'golive-prime-dark': ETheme.Night,
};

export class ThemeModule extends Module {
  moduleName = 'Theme';
  permissions: EApiPermissions[] = [];

  @Inject() customizationService: CustomizationService;

  constructor() {
    super();

    this.customizationService.settingsChanged.subscribe(patch => {
      if (patch.theme != null) {
        // TODO: index
        // @ts-ignore
        this.themeChanged.next(themeTable[patch.theme]);
      }
    });
  }

  @apiEvent()
  themeChanged = new Subject<ETheme>();

  @apiMethod()
  getTheme(): ETheme {
    // TODO: index
    // @ts-ignore
    return themeTable[this.customizationService.currentTheme];
  }
}
