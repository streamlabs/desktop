import { Inject } from 'services/core/injector';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import {
  NicoliveFailure,
  openErrorDialogFromFailure,
} from 'services/nicolive-program/NicoliveFailure';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';

@Component({})
export default class CommentForm extends Vue {
  @Inject()
  nicoliveProgramService: NicoliveProgramService;

  isCommentSending: boolean = false;
  operatorCommentValue: string = '';

  async sendOperatorComment(event: KeyboardEvent) {
    const text = this.operatorCommentValue;
    if (text.length === 0) return;

    const isPermanent = event.ctrlKey;
    if (this.isCommentSending) throw new Error('sendOperatorComment is running');

    try {
      this.isCommentSending = true;
      await this.nicoliveProgramService.sendOperatorComment(text, isPermanent);
      this.operatorCommentValue = '';
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    } finally {
      this.isCommentSending = false;

      this.$nextTick(() => {
        (this.$refs.input as HTMLElement)?.focus();
      });
    }
  }

  get programEnded(): boolean {
    return this.nicoliveProgramService.state.status === 'end';
  }
}
