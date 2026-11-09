import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import cx from 'classnames';
import { $t } from 'services/i18n';
import styles from './AutomationTemplates.m.less';

// One card (230px, see `.card`) plus the gap between cards (`.track`).
const SCROLL_STEP = 242;

interface Props {
  title: string;
  /** The pack cards. */
  children: ReactNode;
}

/** A titled section of pack cards: a horizontal scroller, or a wrapping grid via "See All". */
export default function TemplatePackRow({ title, children }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setHasOverflow(el.scrollWidth > el.clientWidth + 1);
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setCanScroll(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Cards come and go with the filters and the window resizes, so watch both the viewport and
  // the track inside it.
  useEffect(() => {
    measure();
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(track);
    return () => observer.disconnect();
  }, [expanded, measure]);

  function scroll(direction: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: direction * SCROLL_STEP, behavior: 'smooth' });
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {(expanded || hasOverflow) && (
          <a className={styles.seeAll} onClick={() => setExpanded(!expanded)}>
            {expanded ? $t('Show Less') : $t('See All')}
            <i
              className={cx('icon-down', styles.seeAllIcon, { [styles.seeAllIconOpen]: expanded })}
            />
          </a>
        )}
      </div>

      {expanded ? (
        <div className={styles.grid}>{children}</div>
      ) : (
        <div className={styles.scrollerWrap}>
          <div className={styles.scroller} ref={scrollerRef} onScroll={measure}>
            <div className={styles.track} ref={trackRef}>
              {children}
            </div>
          </div>
          {canScroll.left && (
            <button
              type="button"
              className={cx(styles.arrow, styles.arrowLeft)}
              onClick={() => scroll(-1)}
            >
              <i className="icon-down" />
            </button>
          )}
          {canScroll.right && (
            <button
              type="button"
              className={cx(styles.arrow, styles.arrowRight)}
              onClick={() => scroll(1)}
            >
              <i className="icon-down" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
