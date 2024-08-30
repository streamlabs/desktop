import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';

import ProgramDescription from './ProgramDescription.vue';
import CommentViewer from './CommentViewer.vue';
import CommentFilter from './CommentFilter.vue';
import ProgramInfo from './ProgramInfo.vue';
import ProgramStatistics from './ProgramStatistics.vue';
import ToolBar from './ToolBar.vue';
import ControlsArrow from '../../../media/images/controls-arrow-vertical.svg';
import AreaSwitcher, { IArea } from './AreaSwitcher.vue';
import PerformanceMetrics from '../PerformanceMetrics.vue';
import {
  NicoliveFailure,
  openErrorDialogFromFailure,
} from 'services/nicolive-program/NicoliveFailure';
import { CustomizationService } from 'services/customization';

const CREATED_NOTICE_DURATION = 5000; // 番組作成通知の表示時間(ミリ秒)

@Component({
  components: {
    AreaSwitcher,
    ProgramInfo,
    ProgramDescription,
    CommentViewer,
    CommentFilter,
    ProgramStatistics,
    ToolBar,
    ControlsArrow,
    PerformanceMetrics,
  },
})
export default class NicolivePanelRoot extends Vue {
  @Inject()
  nicoliveProgramService: NicoliveProgramService;
  @Inject() private customizationService: CustomizationService;

  destroyed() {
    this.nicoliveProgramService.hidePlaceholder();
  }

  get contents(): IArea[] {
    return [
      {
        name: 'コメント',
        text: '番組に投稿されたコメントを閲覧します',
        slotName: 'commentViewer',
      },
      {
        name: '番組説明文',
        text: '番組作成時に設定した説明文の表示を確認します',
        slotName: 'description',
      },
    ];
  }

  get opened(): boolean {
    return this.nicoliveProgramService.state.panelOpened;
  }

  onToggle(): void {
    this.nicoliveProgramService.togglePanelOpened();
  }

  get isCompactMode(): boolean {
    return this.customizationService.state.compactMode;
  }

  isCreating: boolean = false;
  async createProgram(): Promise<void> {
    if (this.isCreating) throw new Error('createProgram is running');
    try {
      this.isCreating = true;
      await this.nicoliveProgramService.createProgram();
    } catch (e) {
      console.error(e);
    } finally {
      this.isCreating = false;
    }
  }

  isFetching: boolean = false;
  async fetchProgram(): Promise<void> {
    if (this.isFetching) throw new Error('fetchProgram is running');
    try {
      this.isFetching = true;
      await this.nicoliveProgramService.fetchProgram();
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    } finally {
      this.isFetching = false;
    }
  }

  get hasProgram(): boolean {
    return this.nicoliveProgramService.hasProgram;
  }

  get showPlaceholder(): boolean {
    return this.nicoliveProgramService.isShownPlaceholder;
  }
}
