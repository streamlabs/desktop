import { getContentWithFilter } from '../getContentWithFilter';
import { WrappedChat, WrappedMessage, WrappedMessageWithComponent } from '../WrappedChat';
import { ChatComponentType } from './ChatComponentType';
import { isNicoadMessageV0, isNicoadMessageV1 } from './util';

function getCommonComment(chat: WrappedChat): string {
  if (chat.type === 'normal') {
    return getContentWithFilter(chat);
  }
  return chat.value.content ?? '';
}

function getNicoadComment(chat: WrappedMessage): string {
  if (chat.type === 'nicoad') {
    const nicoad = chat.value;
    if (isNicoadMessageV0(nicoad)) {
      if (nicoad.v0.latest) {
        const latest = nicoad.v0.latest;
        const advertiser = latest.advertiser;
        const message = latest.message ? `「${latest.message}」` : '';
        return `提供：${advertiser}さん${message}（${latest.point}pt）`;
      }
    } else if (isNicoadMessageV1(nicoad)) {
      return nicoad.v1.message ?? '';
    }
  }
  return '';
}

function getGiftComment(chat: WrappedMessage): string {
  if (chat.type !== 'gift') {
    return '';
  }
  const gift = chat.value;
  const { advertiserName, point, itemName, contributionRank } = gift;
  const contributionMessage = contributionRank ? `【ギフト貢献第${contributionRank}位】 ` : '';
  return `${contributionMessage}${advertiserName}さんが「${itemName}（${point}pt）」を贈りました`;
}

function getEmotionComment(chat: WrappedMessage): string {
  if (chat.type !== 'emotion') {
    return '';
  }
  return chat.value.content ?? '';
}

function getSystemMessage(chat: WrappedChat): string {
  return chat.value.content ?? '';
}

const displayTextMap: { [type in ChatComponentType]: (chat: WrappedMessage) => string } = {
  common: getCommonComment as (chat: WrappedMessage) => string,
  nicoad: getNicoadComment,
  gift: getGiftComment,
  emotion: getEmotionComment,
  system: getSystemMessage as (chat: WrappedMessage) => string,
};

export function getDisplayText(chat: WrappedMessageWithComponent): string {
  return displayTextMap[chat.component](chat);
}
