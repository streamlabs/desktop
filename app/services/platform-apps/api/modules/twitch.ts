import { Inject } from 'services/core';
import { EApiPermissions, IApiContext, Module, apiEvent, apiMethod } from './module';
import { TwitchService, UserService } from 'app-services';
import { Subject } from 'rxjs';

interface IChatMessage {
  username: string;
  message: string;
}

export class TwitchModule extends Module {
  moduleName = 'Twitch';
  permissions: EApiPermissions[] = [];

  // This module allows use of our local twitch credentials, so only
  // allow streamlabs internal apps to access it.
  requiresHighlyPrivileged = true;

  @Inject() twitchService: TwitchService;
  @Inject() userService: UserService;

  private twitchChatSocket?: WebSocket;

  @apiMethod()
  hasSendChatScope() {
    return this.twitchService.state.hasChatWritePermission;
  }

  @apiMethod()
  async sendChatMessage(ctx: IApiContext, msg: string) {
    await this.twitchService.sendChatMessage(msg);
  }

  @apiMethod()
  requestNewScopes() {
    this.userService.startAuth('twitch', 'external', false, true);
  }

  @apiMethod()
  subscribeToChat(ctx: IApiContext, channel?: string) {
    const TWITCH_IRC_URL = 'wss://irc-ws.chat.twitch.tv';
    const BOT_USERNAME = 'StreamCoach';
    const OAUTH_TOKEN = `oauth:${this.userService.state.auth.platforms.twitch.token}`;
    const CHANNEL = channel || this.userService.state.auth.platforms.twitch.username;

    // If a connection already exists and is open, do nothing
    if (this.twitchChatSocket && this.twitchChatSocket.readyState === WebSocket.OPEN) {
      console.log('Twitch chat is already connected.');
      return;
    }

    // If a connection exists but is not open, close it first
    if (this.twitchChatSocket && this.twitchChatSocket.readyState !== WebSocket.CLOSED) {
      this.twitchChatSocket.close();
    }

    const ws = new WebSocket(TWITCH_IRC_URL);
    this.twitchChatSocket = ws;

    ws.onopen = () => {
      console.log('Connected to Twitch IRC');
      ws.send(`PASS ${OAUTH_TOKEN}`);
      ws.send(`NICK ${BOT_USERNAME}`);
      ws.send(`JOIN #${CHANNEL}`);
    };

    ws.onmessage = event => {
      const message = event.data as string;

      if (message.startsWith('PING')) {
        ws.send('PONG :tmi.twitch.tv');
        return;
      }

      const chatMessageRegex = /:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/;
      const match = message.match(chatMessageRegex);

      if (match) {
        // Use the captured groups by their index
        const username = match[1];
        const chatMessage = match[2];
        console.log(`[${username}]: ${chatMessage}`);
        this.onChat.next({ username, message: chatMessage });
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from Twitch IRC');
      if (this.twitchChatSocket === ws) {
        this.twitchChatSocket = undefined;
      }
    };

    ws.onerror = error => {
      console.error('WebSocket error:', error);
    };
  }

  @apiMethod()
  unsubscribeFromChat() {
    if (this.twitchChatSocket) {
      this.twitchChatSocket.close();
      this.twitchChatSocket = undefined;
    }
  }

  @apiEvent()
  onChat = new Subject<IChatMessage>();
}
