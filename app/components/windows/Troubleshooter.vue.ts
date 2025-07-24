import Vue from 'vue';
import moment from 'moment';
import { Component } from 'vue-property-decorator';
import { Subscription } from 'rxjs';
import { debounceTime, tap } from 'rxjs/operators';
import { Inject } from '../../services/core/injector';
import ModalLayout from '../ModalLayout.vue';
import { TIssueCode } from 'services/troubleshooter';
import { INotification, INotificationsServiceApi } from 'services/notifications';
import { SettingsService, ISettingsSubCategory } from 'services/settings';
import { WindowsService } from 'services/windows';
import { StreamingService } from 'services/streaming';
import { TObsFormData } from '../obs/inputs/ObsInput';
import GenericFormGroups from '../obs/inputs/GenericFormGroups.vue';
import { StartStreamingButton } from 'components/shared/ReactComponentList';
import { CustomizationService } from 'services/customization';

@Component({
  components: { ModalLayout, GenericFormGroups, StartStreamingButton },
})
export default class Troubleshooter extends Vue {
  @Inject() private notificationsService: INotificationsServiceApi;
  @Inject() private settingsService: SettingsService;
  @Inject() private windowsService!: WindowsService;
  @Inject() streamingService: StreamingService;
  @Inject() customizationService: CustomizationService;

  issueCode = this.windowsService.getChildWindowQueryParams().issueCode as TIssueCode;

  private subscription: Subscription;

  created() {
    // Make sure we have the latest settings
    this.settingsService.actions.loadSettingsIntoStore();
  }

  mounted() {
    this.subscription = this.streamingService.streamingStatusChange
      .pipe(debounceTime(500), tap(this.settingsService.actions.loadSettingsIntoStore))
      .subscribe();
  }

  get issue(): INotification {
    return this.notificationsService.views.getAll().find(notify => notify.code === this.issueCode);
  }

  get streamingSettings(): ISettingsSubCategory[] | null {
    if (this.issueCode !== 'FRAMES_DROPPED') return null;
    return this.settingsService.state.Stream.formData.map(hideParamsForCategory);
  }

  get outputSettings(): ISettingsSubCategory[] | null {
    if (this.issueCode !== 'FRAMES_DROPPED') return null;
    return this.settingsService.state.Output.formData.map(hideParamsForCategory);
  }

  get performanceMode() {
    return this.customizationService.state.performanceMode;
  }

  showSettings() {
    this.settingsService.showSettings();
  }

  get isStreaming() {
    return this.streamingService.isStreaming;
  }

  saveOutputSettings() {
    this.settingsService.setSettings('Output', this.outputSettings);
  }

  saveStreamingSettings() {
    this.settingsService.setSettings('Stream', this.streamingSettings);
  }

  moment(time: number): string {
    return moment(time).fromNow();
  }

  destroyed() {
    this.subscription.unsubscribe();
  }

  enablePerformanceMode() {
    this.customizationService.setSettings({
      performanceMode: true,
    });
  }
}

const paramsToShow = ['server', 'VBitrate', 'ABitrate'];

const hideParamsForCategory = (category: ISettingsSubCategory): ISettingsSubCategory => ({
  ...category,
  parameters: hideParams(category.parameters),
});

const hideParams = (parameters: TObsFormData): TObsFormData => {
  return parameters.map(parameter => ({
    ...parameter,
    visible: paramsToShow.includes(parameter.name),
  }));
};
