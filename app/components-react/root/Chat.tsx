import * as remote from '@electron/remote';
import React, { useEffect, useRef } from 'react';
import { Services } from '../service-provider';
import styles from './Chat.m.less';
import { OS, getOS } from '../../util/operating-systems';
import { onUnload } from 'util/unload';
import { debounce } from 'lodash';

export default function Chat(props: {
  restream: boolean;
  visibleChat: string;
  setChat: (key: string) => void;
}) {
  const { ChatService, RestreamService } = Services;

  const chatEl = useRef<HTMLDivElement>(null);

  let currentPosition: IVec2 | null;
  let currentSize: IVec2 | null;

  let leaveFullScreenTrigger: Function;

  useEffect(() => {
    const service = props.restream ? RestreamService : ChatService;
    const cancelUnload = onUnload(() => service.actions.unmountChat(remote.getCurrentWindow().id));

    window.addEventListener('resize', debounce(checkResize, 100));

    // Work around an electron bug on mac where chat is not interactable
    // after leaving fullscreen until chat is remounted.
    if (getOS() === OS.Mac) {
      leaveFullScreenTrigger = () => {
        setTimeout(() => {
          setupChat();
          checkResize();
        }, 1000);
      };

      remote.getCurrentWindow().on('leave-full-screen', leaveFullScreenTrigger);
    }

    setupChat();
    // Wait for livedock to expand to set chat resize
    setTimeout(checkResize, 100);

    return () => {
      window.removeEventListener('resize', debounce(checkResize, 100));

      if (getOS() === OS.Mac) {
        remote.getCurrentWindow().removeListener('leave-full-screen', leaveFullScreenTrigger);
      }

      service.actions.unmountChat(remote.getCurrentWindow().id);
      cancelUnload();
    };
  }, [props.restream]);

  function setupChat() {
    const service = props.restream ? RestreamService : ChatService;
    const windowId = remote.getCurrentWindow().id;

    ChatService.actions.unmountChat();
    RestreamService.actions.unmountChat(windowId);

    service.actions.mountChat(windowId);
    currentPosition = null;
    currentSize = null;
  }

  function checkResize() {
    const service = props.restream ? RestreamService : ChatService;

    if (!chatEl.current) return;

    const rect = chatEl.current.getBoundingClientRect();

    if (currentPosition == null || currentSize == null || rectChanged(rect)) {
      currentPosition = { x: rect.left, y: rect.top };
      currentSize = { x: rect.width, y: rect.height };

      service.actions.setChatBounds(currentPosition, currentSize);
    }
  }

  function rectChanged(rect: ClientRect) {
    return (
      rect.left !== currentPosition?.x ||
      rect.top !== currentPosition?.y ||
      rect.width !== currentSize?.x ||
      rect.height !== currentSize?.y
    );
  }

  return <div className={styles.chat} ref={chatEl} />;
}
