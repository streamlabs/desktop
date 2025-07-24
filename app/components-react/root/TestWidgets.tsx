import React, { useState, useMemo } from 'react';
import Animation from 'rc-animate';
import { Services } from '../service-provider';
import { $t } from '../../services/i18n';

export default function TestWidgets(p: { testers?: string[] }) {
  const { WidgetsService } = Services;

  const [slideOpen, setSlideOpen] = useState(false);

  const allTesters = useMemo(() => WidgetsService.views.testers, []);
  const widgetTesters = p.testers
    ? allTesters.filter(tester => p.testers?.includes(tester.name))
    : allTesters;

  function test(testerName: string) {
    // TODO: uses deprecated function
    WidgetsService.actions.test(testerName);
  }

  return (
    <div className="slide-open">
      <a className="slide-open__open link" onClick={() => setSlideOpen(!slideOpen)}>
        {$t('Test Widgets')}
      </a>
      <Animation transitionName="ant-slide-right">
        {slideOpen && (
          <div className="slide-open__menu" style={{ zIndex: 1011 }}>
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
