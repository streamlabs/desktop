import React, { useEffect, useRef } from 'react';
import { Services } from 'components-react/service-provider';
import { ModalLayout } from 'components-react/shared/ModalLayout';

// <webview> is not in React's intrinsic elements; declare it locally.
const Webview = ('webview' as unknown) as React.ElementType;

export default function FFZSettings() {
  const { CustomizationService, UserService } = Services;
  const webviewRef = useRef<Electron.WebviewTag>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // Resolved once on mount, same as the Vue component
    const nightMode = CustomizationService.isDarkTheme;
    const partition = UserService.views.isLoggedIn ? UserService.views.auth?.partition : undefined;
    const popoutURL = `https://www.twitch.tv/popout/frankerfacez/chat?ffz-settings${
      nightMode ? '&darkpopout' : ''
    }`;

    const onDomReady = () => {
      webview.setZoomFactor(CustomizationService.state.chatZoomFactor);

      webview.executeJavaScript(
        `
        var ffzscript1 = document.createElement('script');
        ffzscript1.setAttribute('src','https://cdn.frankerfacez.com/script/script.min.js');
        document.head.appendChild(ffzscript1);
        0;
      `,
        true,
      );
    };

    webview.addEventListener('dom-ready', onDomReady);

    // partition must be set before the webview navigates, so set it before src
    if (partition) webview.setAttribute('partition', partition);
    webview.setAttribute('src', popoutURL);

    return () => {
      webview.removeEventListener('dom-ready', onDomReady);
    };
  }, []);

  return (
    <ModalLayout hideFooter>
      <div style={{ height: '100%' }}>
        <Webview
          ref={webviewRef}
          id="ffz-settings"
          className="ffz-settings-container"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </ModalLayout>
  );
}
