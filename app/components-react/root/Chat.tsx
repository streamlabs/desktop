import * as remote from '@electron/remote';
import React, { useEffect, useRef, useCallback, useMemo } from 'react';
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

  const currentPosition = useRef<IVec2 | null>(null);
  const currentSize = useRef<IVec2 | null>(null);
  const service = useMemo(() => (props.restream ? RestreamService : ChatService), [props.restream]);
  const windowId = useMemo(() => remote.getCurrentWindow().id, []);

  const leaveFullScreenTrigger = useCallback(() => {
    setTimeout(() => {
      setupChat();
      checkResize();
    }, 1000);
  }, []);

  useEffect(() => {
    const cancelUnload = onUnload(() => service.actions.unmountChat(remote.getCurrentWindow().id));

    window.addEventListener('resize', debounce(checkResize, 100));

    // Work around an electron bug on mac where chat is not interactable
    // after leaving fullscreen until chat is remounted.
    if (getOS() === OS.Mac) {
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
    ChatService.actions.unmountChat();
    RestreamService.actions.unmountChat(windowId);

    service.actions.mountChat(windowId);
    currentPosition.current = null;
    currentSize.current = null;
  }

  const checkResize = useCallback(() => {
    if (!chatEl.current) return;

    const rect = chatEl.current.getBoundingClientRect();

    if (currentPosition.current == null || currentSize == null || rectChanged(rect)) {
      currentPosition.current = { x: rect.left, y: rect.top };
      currentSize.current = { x: rect.width, y: rect.height };

      service.actions.setChatBounds(currentPosition.current, currentSize.current);
    }
  }, []);

  const rectChanged = useCallback((rect: DOMRect) => {
    if (!currentPosition.current || !currentSize.current) return;
    return (
      rect.left !== currentPosition.current?.x ||
      rect.top !== currentPosition.current?.y ||
      rect.width !== currentSize.current?.x ||
      rect.height !== currentSize.current?.y
    );
  }, []);

  return <div className={styles.chat} ref={chatEl} />;
}
