import { ChatMessage } from 'services/nicolive-program/ChatMessage';
import { getDisplayText } from 'services/nicolive-program/ChatMessage/displaytext';
import { getDisplayName } from 'services/nicolive-program/ChatMessage/getDisplayName';
import { WrappedChatWithComponent } from 'services/nicolive-program/WrappedChat';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

@Component({})
export class CommentBase extends Vue {
  @Prop() chat: WrappedChatWithComponent;
  @Prop() getFormattedLiveTime: (chat: ChatMessage) => string;

  get computedContent() {
    return getDisplayText(this.chat);
  }
  get computedName() {
    return getDisplayName(this.chat);
  }

  get computedTitle() {
    return `${this.computedContent} (${this.$props.getFormattedLiveTime(this.chat.value)})`;
  }
}
