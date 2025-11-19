import * as remote from '@electron/remote';
import React, { useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Services } from '../service-provider';
import styles from './Chat.m.less';
import { OS, getOS } from '../../util/operating-systems';
import { onUnload } from 'util/unload';
import { useRealmObject } from 'components-react/hooks/realm';

function Chat(props: { restream: boolean; visibleChat: string; setChat: (key: string) => void }) {
  const { ChatService, RestreamService, CustomizationService } = Services;

  const dockWidth = useRealmObject(CustomizationService.state).livedockSize;
  const chatEl = useRef<HTMLDivElement>(null);

  const currentPosition = useRef<IVec2 | null>(null);
  const currentSize = useRef<IVec2 | null>(null);
  const mountedRef = useRef<boolean>(true);
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

    // Work around an electron bug on mac where chat is not interactable
    // after leaving fullscreen until chat is remounted.
    if (getOS() === OS.Mac) {
      remote.getCurrentWindow().on('leave-full-screen', leaveFullScreenTrigger);
    }

    setupChat();
    // Wait for livedock to expand to set chat resize
    setTimeout(checkResize, 100);

    return () => {
      if (getOS() === OS.Mac) {
        remote.getCurrentWindow().removeListener('leave-full-screen', leaveFullScreenTrigger);
      }

      service.actions.unmountChat(remote.getCurrentWindow().id);
      cancelUnload();

      mountedRef.current = false;
    };
  }, []);

  const checkResize = useCallback(() => {
    if (!chatEl.current || !mountedRef.current) return;

    const rect = chatEl.current.getBoundingClientRect();

    if (currentPosition.current == null || currentSize == null || rectChanged(rect)) {
      currentPosition.current = { x: rect.left, y: rect.top };
      currentSize.current = { x: rect.width, y: rect.height };

      service.actions.setChatBounds(currentPosition.current, currentSize.current);
    }
  }, [service]);

  const rectChanged = useCallback((rect: DOMRect) => {
    if (!currentPosition.current || !currentSize.current) return;
    return (
      rect.left !== currentPosition.current?.x ||
      rect.top !== currentPosition.current?.y ||
      rect.width !== currentSize.current?.x ||
      rect.height !== currentSize.current?.y
    );
  }, []);

  // Handle chat component resize by updating the chat bounds when dock width changes
  // Use the chat element's bounding rect for the actual size and position for accuracy
  useEffect(() => {
    if (mountedRef.current) {
      checkResize();
    }
  }, [dockWidth]);

  const setupChat = useCallback(() => {
    ChatService.actions.unmountChat();
    RestreamService.actions.unmountChat(windowId);

    service.actions.mountChat(windowId);
    currentPosition.current = null;
    currentSize.current = null;
  }, [service, windowId]);

  return <div className={styles.chat} ref={chatEl} />;
}

export default memo(Chat);
