import { IWidgetApiSettings, IWidgetData, WidgetSettingsService } from 'services/widgets';
import { InheritMutations } from 'services/core/stateful-service';
import { handleResponse } from 'util/requests';

interface IBaseGoalData extends IWidgetData {
  goal: Dictionary<any>;
}

interface IGoalWidgetApiSettings extends IWidgetApiSettings {
  goalUrl: string;
  goalCreateEvent?: string;
  goalResetEvent?: string;
}

@InheritMutations()
export abstract class BaseGoalService<
  TGoalData extends IBaseGoalData,
  TGoalCreateOptions
> extends WidgetSettingsService<TGoalData> {
  subToWebsocket() {
    super.subToWebsocket();

    this.websocketService.socketEvent.subscribe(event => {
      const apiSettings = this.getApiSettings();
      if (event.type === apiSettings.goalCreateEvent || event.type === apiSettings.goalResetEvent) {
        this.refreshData();
      }
    });
  }

  abstract getApiSettings(): IGoalWidgetApiSettings;

  protected patchAfterFetch(data: TGoalData): TGoalData {
    // fix a bug when API returning an empty array instead of null
    if (Array.isArray(data.goal)) data.goal = null;
    return data;
  }

  async saveGoal(options: TGoalCreateOptions) {
    const apiSettings = this.getApiSettings();
    return await this.request({
      url: apiSettings.goalUrl,
      method: 'POST',
      body: options,
    });
  }

  async resetGoal() {
    const apiSettings = this.getApiSettings();

    return await this.request({
      url: apiSettings.goalUrl,
      method: 'DELETE',
    });
  }
}
