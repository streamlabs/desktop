import React from 'react';
import RealtimeHighlightsTooltip from './RealtimeHighlightsFeed';
import styles from './RealtimeHighlightsIndicator.m.less';
import RealtimeIndicator from '../RealtimeIndicator';

export default function RealtimeHighlightsIndicator() {
  return <RealtimeHighlightsTooltip placement="topLeft" maxEvents={3}></RealtimeHighlightsTooltip>;
}
