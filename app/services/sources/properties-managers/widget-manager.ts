import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WidgetsService, WidgetType } from 'services/widgets';

export interface IWidgetManagerSettings {
  widgetType: WidgetType;
}

/**
 * This properties manager is designed to wrap a browser
 * source and allows switching the widget type.  In the
 * future, this will be responsible for changing the URL
 * when the user logs into another account.
 */
export class WidgetManager extends PropertiesManager {
  @Inject() widgetsService: WidgetsService;

  displayOrder = ['widgetType'];

  customUIComponent = 'WidgetProperties';

  settings: IWidgetManagerSettings;

  get denylist() {
    return ['url', 'is_local_file'];
  }

  applySettings(settings: Dictionary<any>) {
    settings.widgetType = parseInt(settings.widgetType, 10);
    super.applySettings(settings);
    this.setWidgetType(this.settings.widgetType);
  }

  setWidgetType(type: WidgetType) {
    const url = this.widgetsService.getWidgetUrl(type);

    if (this.obsSource.settings['url'] !== url) {
      this.obsSource.update({ url });
    }
  }
}
