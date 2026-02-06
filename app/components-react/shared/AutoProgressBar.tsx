import { Progress } from 'antd';
import React, { useEffect, useState } from 'react';

/**
 * A progress bar that automatically increments itself in the
 * absence of progress updates.
 * @param p.percent current percent of the progress bar
 * @param p.timeTarget the time it takes to reach 100% in ms
 */
export default function AutoProgressBar(p: {
  percent: number;
  timeTarget: number;
  showInfo?: boolean;
  className?: string;
  small?: boolean;
}) {
  const [renderedPercent, setRenderedPercent] = useState(0);
  const showInfo = p.showInfo ?? true;

  useEffect(() => {
    let currentPercent = p.percent;
    const incrementPeriod = 300;
    const incrementVal = (incrementPeriod / p.timeTarget) * 100;
    const interval = window.setInterval(() => {
      currentPercent = Math.min(100, currentPercent + incrementVal);
      setRenderedPercent(currentPercent);
    }, incrementPeriod);

    return () => clearInterval(interval);
  }, [p.percent]);

  return (
    <Progress
      percent={renderedPercent}
      status="active"
      format={p => `${p?.toFixed(0)}%`}
      showInfo={showInfo}
      className={p?.className}
      size={p?.small ? 'small' : 'default'}
    />
  );
}
