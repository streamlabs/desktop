import { InitAfter, Inject } from './core';
import { StatefulService, mutation } from './core/stateful-service';
import { NicoliveProgramService } from './nicolive-program/nicolive-program';
import { ScenesService } from './scenes';
import { SourcesService } from './sources';

export interface ICustomcastUsageState {
  isCustomcastUsed: boolean;
  programID: string;
}

InitAfter('ScenesService');
export class CustomcastUsageService extends StatefulService<ICustomcastUsageState> {
  static initialState: ICustomcastUsageState = {
    isCustomcastUsed: false,
    programID: '',
  };

  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private nicoliveProgramService: NicoliveProgramService;

  init() {
    this.reset();

    this.scenesService.sceneSwitched.subscribe(() => {
      if (this.containsCustomcastInActiveScene()) {
        this.markCustomcastUsed();
      }
    });

    this.scenesService.itemAdded.subscribe(item => {
      if (this.isCustomcastSourceId(item.sourceId)) {
        this.markCustomcastUsed();
      }
    });
  }

  isCustomcastSourceId(sourceId: string): boolean {
    const sourceDetails = this.sourcesService.getSource(sourceId).getComparisonDetails();
    return sourceDetails.propertiesManager === 'custom-cast-ndi';
  }

  containsCustomcastInActiveScene(): boolean {
    for (const item of this.scenesService.activeScene.getItems()) {
      if (this.isCustomcastSourceId(item.sourceId)) {
        return true;
      }
    }
    return false;
  }

  startStreaming() {
    this.reset();
    if (this.containsCustomcastInActiveScene()) {
      this.markCustomcastUsed();
    }
  }

  stopStreaming() {
    if (this.state.isCustomcastUsed && this.state.programID !== '') {
      this.sendLog(this.state.programID);
    }
  }

  private async sendLog(programID: string) {
    const url = 'https://dcdn.cdn.nicovideo.jp/shared_httpd/log.gif';
    const params = new URLSearchParams();
    params.append('frontend_id', '134');
    params.append('id', 'customcast');
    params.append('content_id', programID);
    return await fetch(`${url}?${params}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
    });
  }

  private reset() {
    this.SET_IS_CUSTOMCAST_USED(false);
    this.SET_PROGRAM_ID('');
  }

  private markCustomcastUsed() {
    this.SET_IS_CUSTOMCAST_USED(true);
    this.SET_PROGRAM_ID(this.nicoliveProgramService.state.programID);
  }

  @mutation()
  private SET_IS_CUSTOMCAST_USED(isCustomcastUsed: boolean) {
    this.state.isCustomcastUsed = isCustomcastUsed;
  }

  @mutation()
  private SET_PROGRAM_ID(programID: string) {
    this.state.programID = programID;
  }
}
