import { dwango } from '@n-air-app/nicolive-comment-protobuf';
import { Observable, Subject, Subscription } from 'rxjs';
import { IMessageServerClient } from './MessageServerClient';
import { NdgrClient, toNumber } from './NdgrClient';
import { MessageResponse, NotificationType, NotificationTypeTable } from './ChatMessage';

const NUM_BACKWARD_COMMENTS = 100;

function toHex2(n: number) {
  return n.toString(16).padStart(2, '0');
}

const namedColorTable: { [key in dwango.nicolive.chat.data.Chat.Modifier.ColorName]: string } = {
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.white]: '', // whiteはエンコードされない
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.red]: 'red',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.pink]: 'pink',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.orange]: 'orange',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.yellow]: 'yellow',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.green]: 'green',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.cyan]: 'cyan',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.blue]: 'blue',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.purple]: 'purple',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.black]: 'black',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.white2]: 'white2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.red2]: 'red2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.blue2]: 'blue2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.green2]: 'green2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.yellow2]: 'yellow2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.purple2]: 'purple2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.cyan2]: 'cyan2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.orange2]: 'orange2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.pink2]: 'pink2',
  [dwango.nicolive.chat.data.Chat.Modifier.ColorName.black2]: 'black2',
} as const;

export function convertModifierToMail(modifier: dwango.nicolive.chat.data.Chat.IModifier): string {
  const commands: string[] = [];
  if (modifier.position) {
    switch (modifier.position) {
      case dwango.nicolive.chat.data.Chat.Modifier.Pos.shita:
        commands.push('shita');
        break;
      case dwango.nicolive.chat.data.Chat.Modifier.Pos.ue:
        commands.push('ue');
        break;
    }
  }
  if (modifier.size) {
    switch (modifier.size) {
      case dwango.nicolive.chat.data.Chat.Modifier.Size.big:
        commands.push('big');
        break;
      case dwango.nicolive.chat.data.Chat.Modifier.Size.small:
        commands.push('small');
        break;
    }
  }
  if (modifier.namedColor) {
    const color = namedColorTable[modifier.namedColor];
    if (color) {
      commands.push(color);
    }
  }
  if (modifier.fullColor) {
    commands.push(
      [
        '#',
        toHex2(modifier.fullColor.r ?? 0),
        toHex2(modifier.fullColor.g ?? 0),
        toHex2(modifier.fullColor.b ?? 0),
      ].join(''),
    );
  }
  if (modifier.font) {
    switch (modifier.font) {
      case dwango.nicolive.chat.data.Chat.Modifier.Font.mincho:
        commands.push('mincho');
        break;
      case dwango.nicolive.chat.data.Chat.Modifier.Font.gothic:
        commands.push('gothic');
        break;
    }
  }
  if (modifier.opacity) {
    switch (modifier.opacity) {
      case dwango.nicolive.chat.data.Chat.Modifier.Opacity.Translucent:
        commands.push('_live');
        break;
    }
  }
  return commands.join(' ');
}

type CommonComponent = { date: number; date_usec: number };

function convertChatToMessageResponse(
  common: CommonComponent,
  chat: dwango.nicolive.chat.data.IChat,
  id: string,
): MessageResponse {
  const { user_id, anonymity } = (() => {
    if (chat.hashedUserId) {
      return { anonymity: 1, user_id: chat.hashedUserId };
    }
    if (chat.rawUserId) {
      return { anonymity: 0, user_id: chat.rawUserId.toString() };
    }
    return { anonymity: 0, user_id: '' };
  })();

  return {
    chat: {
      ...common,
      ...(id ? { id } : {}),
      ...(chat.content ? { content: chat.content } : {}),
      ...(chat.no !== undefined ? { no: chat.no } : {}),
      ...(chat.accountStatus === dwango.nicolive.chat.data.Chat.AccountStatus.Premium
        ? { premium: 1 }
        : {}),
      ...(user_id ? { user_id } : {}),
      ...(anonymity ? { anonymity } : {}),
      ...(chat.vpos !== undefined ? { vpos: chat.vpos } : {}),
      ...(chat.name ? { name: chat.name } : {}),
      ...(chat.modifier ? { mail: convertModifierToMail(chat.modifier) } : {}),
    },
  };
}

function convertSimpleNotificationToMessageResponse(
  common: CommonComponent,
  notification: dwango.nicolive.chat.data.ISimpleNotification,
): MessageResponse | undefined {
  const key = Object.keys(notification)[0] as NotificationType;
  if (!NotificationTypeTable.includes(key)) {
    console.warn('Unknown simpleNotification type', notification);
    return undefined;
  }
  return {
    notification: {
      ...common,
      type: key,
      message: notification[key],
    },
  };
}

function convertGiftToMessageResponse(
  common: CommonComponent,
  gift: dwango.nicolive.chat.data.IGift,
): MessageResponse {
  return {
    gift: {
      ...common,
      ...(gift.itemId ? { itemId: gift.itemId } : {}),
      ...(gift.advertiserUserId ? { advertiserUserId: toNumber(gift.advertiserUserId) } : {}),
      ...(gift.advertiserName ? { advertiserName: gift.advertiserName } : {}),
      ...(gift.point ? { point: toNumber(gift.point) } : {}),
      ...(gift.message ? { message: gift.message } : {}),
      ...(gift.itemName ? { itemName: gift.itemName } : {}),
      ...(gift.contributionRank ? { contributionRank: gift.contributionRank } : {}),
    },
  };
}

function convertNicoadToMessageResponse(
  common: CommonComponent,
  nicoad: dwango.nicolive.chat.data.INicoad,
): MessageResponse {
  if (nicoad.v0) {
    const v0 = nicoad.v0;
    const latest = v0.latest;
    const ranking = v0.ranking;
    return {
      nicoad: {
        ...common,
        v0: {
          latest: {
            ...(latest.advertiser ? { advertiser: latest.advertiser } : {}),
            ...(latest.point ? { point: latest.point } : {}),
            ...(latest.message ? { message: latest.message } : {}),
          },
          ranking: ranking.map(r => ({
            ...(r.advertiser ? { advertiser: r.advertiser } : {}),
            ...(r.rank ? { rank: r.rank } : {}),
            ...(r.message ? { message: r.message } : {}),
            ...(r.userRank ? { userRank: r.userRank } : {}),
          })),
          ...(v0.totalPoint ? { totalPoint: v0.totalPoint } : {}),
        },
      },
    };
  } else if (nicoad.v1) {
    const v1 = nicoad.v1;
    return {
      nicoad: {
        ...common,
        v1: {
          ...(v1.totalAdPoint ? { totalAdPoint: v1.totalAdPoint } : {}),
          ...(v1.message ? { message: v1.message } : {}),
        },
      },
    };
  }
}

function convertGameUpdateToMessageResponse(
  common: CommonComponent,
  _gameUpdate: dwango.nicolive.chat.data.IGameUpdate,
): MessageResponse {
  return {
    gameUpdate: {
      ...common,
      // empty
    },
  };
}

function convertMarqueeToMessageResponse(
  common: CommonComponent,
  marquee: dwango.nicolive.chat.data.IMarquee,
): MessageResponse {
  if (marquee.display) {
    const display = marquee.display;
    if (display.operatorComment) {
      const operatorComment = display.operatorComment;
      return {
        operator: {
          ...common,
          content: operatorComment.content,
          link: operatorComment.link,
          mail: operatorComment.modifier
            ? convertModifierToMail(operatorComment.modifier)
            : undefined,
          name: operatorComment.name,
        },
      };
    }
  }
  return undefined;
}

function convertProgramStatusToMessageResponse(
  common: CommonComponent,
  programStatus: dwango.nicolive.chat.data.IProgramStatus,
): MessageResponse | undefined {
  switch (programStatus.state) {
    case dwango.nicolive.chat.data.ProgramStatus.State.Ended:
      // "/disconnect"
      return {
        state: {
          ...common,
          state: 'ended',
        },
      };
  }
  return undefined;
}

function convertSignalToMessageResponse(
  signal: dwango.nicolive.chat.service.edge.ChunkedMessage.Signal,
): MessageResponse {
  switch (signal) {
    case dwango.nicolive.chat.service.edge.ChunkedMessage.Signal.Flushed:
      return {
        signal: 'flushed',
      };
  }
  return undefined;
}

export function convertChunkedResponseToMessageResponse(
  msg: dwango.nicolive.chat.service.edge.IChunkedMessage,
  now = Date.now(),
): MessageResponse | undefined {
  const common: CommonComponent = {
    date: toNumber(msg.meta?.at?.seconds ?? Math.floor(now / 1000)),
    date_usec: Math.floor(toNumber(msg.meta?.at?.nanos ?? (now % 1000) * 1000000) / 1000),
  };
  if (msg.message) {
    if (msg.message.chat) {
      return convertChatToMessageResponse(common, msg.message.chat, msg.meta?.id);
    } else if (msg.message.simpleNotification) {
      return convertSimpleNotificationToMessageResponse(common, msg.message.simpleNotification);
    } else if (msg.message.gift) {
      return convertGiftToMessageResponse(common, msg.message.gift);
    } else if (msg.message.nicoad) {
      return convertNicoadToMessageResponse(common, msg.message.nicoad);
    } else if (msg.message.gameUpdate) {
      return convertGameUpdateToMessageResponse(common, msg.message.gameUpdate);
    }
  } else if (msg.state) {
    if (msg.state.marquee) {
      // 運コメ(放送者コメント)
      return convertMarqueeToMessageResponse(common, msg.state.marquee);
    } else if (msg.state.programStatus) {
      return convertProgramStatusToMessageResponse(common, msg.state.programStatus);
    }
  } else if (msg.signal !== undefined) {
    return convertSignalToMessageResponse(msg.signal);
  }
  return undefined;
}

export class NdgrCommentReceiver implements IMessageServerClient {
  private ndgrClient: NdgrClient;
  private ndgrSubscription: Subscription;
  private messageSubject = new Subject<MessageResponse>();

  constructor(private uri: string, private label = 'comment') {}

  connect(): Observable<MessageResponse> {
    this.ndgrClient = new NdgrClient(this.uri, this.label);
    this.ndgrSubscription = this.ndgrClient.messages.subscribe({
      next: msg => {
        const now = Date.now(); // in milliseconds
        const result = convertChunkedResponseToMessageResponse(msg, now);
        if (result) {
          this.messageSubject.next(result);
        }
      },
    });
    this.ndgrClient.connect('now', NUM_BACKWARD_COMMENTS).catch(err => {
      console.warn('Failed to connect to ndgr', err);
      this.messageSubject.error(err);
    });
    return this.messageSubject.asObservable();
  }

  close(): void {
    if (this.ndgrClient) {
      this.ndgrClient.dispose();
      this.ndgrClient = null;
      this.ndgrSubscription.unsubscribe();
    }
  }
}
