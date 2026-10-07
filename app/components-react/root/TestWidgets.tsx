import React, { useState, useEffect } from 'react';
import Animation from 'rc-animate';
import { Services } from '../service-provider';
import { useVuex } from '../hooks';
import { $t } from '../../services/i18n';

type VisionTesterValue = 'elimination' | 'victory' | 'death';

type VisionTester = {
  name: string;
  value: VisionTesterValue;
};

const VISION_TESTERS: VisionTester[] = [
  { name: 'Kill', value: 'elimination' },
  { name: 'Win', value: 'victory' },
  { name: 'Death', value: 'death' },
];

function isReactiveSource(source: { propertiesManagerType: string }) {
  return source.propertiesManagerType === 'smartBrowserSource';
}

export default function TestWidgets(p: { testers?: string[] }) {
  const { WidgetsService, VisionService, SourcesService } = Services;

  const [slideOpen, setSlideOpen] = useState(false);
  const [hasSmartBrowser, setHasSmartBrowser] = useState(
    !!SourcesService.views.sources.some(s => s.propertiesManagerType === 'smartBrowserSource'),
  );

  // Do not use the useSubscription hook here so that the subscribe/unsubscribe is handled in sequence
  useEffect(() => {
    const addSub = SourcesService.sourceAdded.subscribe(source => {
      if (isReactiveSource(source)) {
        setHasSmartBrowser(true);
      } else if (!SourcesService.views.sources.some(isReactiveSource)) {
        setHasSmartBrowser(false);
      }
    });

    const removeSub = SourcesService.sourceRemoved.subscribe(source => {
      if (
        isReactiveSource(source) &&
        !SourcesService.views.sources.some(
          s => s.state.sourceId !== source.sourceId && isReactiveSource(s),
        )
      ) {
        setHasSmartBrowser(false);
      }
    });

    // •
    // Asana & Bug Workflow Tools
    // •
    // Testing Suite, Agents & Commands
    // •
    // Code Hygiene & Review Tools
    // •
    // PR & Release Management
    // •
    // Environment Setup & Branch Lifecycle

    return () => {
      addSub?.unsubscribe?.();
      removeSub?.unsubscribe?.();
    };
  }, [SourcesService]);

  // Testers depend on the primary platform, which changes when destinations are toggled in Go Live.
  const { allTesters } = useVuex(() => ({ allTesters: WidgetsService.views.testers })) ?? {};
  const widgetTesters = p.testers
    ? allTesters.filter(tester => p.testers?.includes(tester.name))
    : allTesters;

  function test(testerName: string) {
    // TODO: uses deprecated function
    WidgetsService.actions.test(testerName);
  }

  function testReactive(testerName: VisionTesterValue) {
    VisionService.actions.testEvent(testerName);
  }

  return (
    <div className="slide-open">
      <a className="slide-open__open link" onClick={() => setSlideOpen(!slideOpen)}>
        {$t('Test Widgets')}
      </a>
      <Animation transitionName="ant-slide-right">
        {slideOpen && (
          <div className="slide-open__menu" style={{ zIndex: 1011 }}>
            {hasSmartBrowser &&
              VISION_TESTERS.map(tester => (
                <button
                  className="button button--trans"
                  key={`test-reactive-${tester.value}`}
                  onClick={() => testReactive(tester.value)}
                >
                  {$t(tester.name)}
                </button>
              ))}
            {widgetTesters.map(tester => (
              <button
                className="button button--trans"
                key={tester.name}
                onClick={() => test(tester.name)}
              >
                {$t(tester.name)}
              </button>
            ))}
          </div>
        )}
      </Animation>
    </div>
  );
}
