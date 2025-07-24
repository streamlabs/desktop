import React, { useRef } from 'react';
import BrowserView from 'components-react/shared/BrowserView';
import { ELayoutElement } from 'services/layout';
import { Services } from 'components-react/service-provider';
import useBaseElement from './hooks';

const mins = { x: 0, y: 0 };

export function Browser() {
  const { LayoutService, UserService } = Services;
  const containerRef = useRef<HTMLDivElement>(null);

  const { renderElement } = useBaseElement(<BrowserEl />, mins, containerRef.current);

  function url() {
    const src = LayoutService.views.currentTab.slottedElements[ELayoutElement.Browser]?.src;
    if (!src) return '';
    if (!/^https?\:\/\//.test(src)) {
      return `https://${src}`;
    }
    return src;
  }

  function BrowserEl() {
    return (
      <BrowserView
        src={url()}
        options={{
          webPreferences: { partition: UserService.views.auth?.partition, contextIsolation: true },
        }}
      />
    );
  }

  return (
    <div ref={containerRef} style={{ height: '100%' }}>
      {renderElement()}
    </div>
  );
}

Browser.mins = mins;
