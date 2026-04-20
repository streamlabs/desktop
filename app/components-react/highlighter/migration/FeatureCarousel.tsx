import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import styles from '../MigrationNotice.m.less';

export interface Feature {
  id: string;
  headline: string;
  previewImage?: string;
}

export const CAROUSEL_FEATURES: Feature[] = [
  { id: 'ai-reels', headline: 'Auto created reels in seconds powered by Streamlabs AI' },
  { id: 'subtitles', headline: 'Auto subtitles inspired by the pros' },
  {
    id: 'verticaliser',
    headline: 'AI Verticaliser - Convert your Horizontal videos into Vertical',
  },
  { id: 'sharing', headline: 'Grow everywhere - Direct sharing' },
  { id: 'gameplay', headline: 'Auto-Record gameplay - perfect for gamers' },
  { id: 'titles', headline: 'Get Pro Titles, Thumbnails and descriptions' },
];

const ANIM_DURATION = 220;
const AUTO_ANIM_DURATION = 500;
const AUTO_ADVANCE_INTERVAL = 5000;

interface IFeatureCarouselProps {
  title: string;
  description?: string;
  features: Feature[];
  children?: React.ReactNode;
}

type TransitionState = 'hover' | 'animating' | null;

export default function FeatureCarousel(props: IFeatureCarouselProps) {
  const { title, description, features, children } = props;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [incomingIndex, setIncomingIndex] = useState<number | null>(null);
  const [transitionState, setTransitionState] = useState<TransitionState>(null);
  const [animDuration, setAnimDuration] = useState(ANIM_DURATION);
  const [direction, setDirection] = useState<-1 | 1>(1);

  const isListHoveredRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);
  const transitionStateRef = useRef(transitionState);
  const incomingIndexRef = useRef(incomingIndex);

  currentIndexRef.current = currentIndex;
  isAnimatingRef.current = transitionState === 'animating';
  transitionStateRef.current = transitionState;
  incomingIndexRef.current = incomingIndex;

  const currentFeature = useMemo(() => features[currentIndex], [features, currentIndex]);
  const incomingFeature = useMemo(() => (incomingIndex !== null ? features[incomingIndex] : null), [
    features,
    incomingIndex,
  ]);

  const currentCardStyle = useMemo<React.CSSProperties>(() => {
    if (transitionState === 'animating') {
      return {
        transform: `translateY(${direction * -500}px)`,
        opacity: 0,
        transition: `transform ${animDuration}ms ease, opacity ${animDuration}ms ease`,
      };
    }
    return { transform: 'translateY(0)', opacity: 1, transition: 'none' };
  }, [transitionState, direction, animDuration]);

  const incomingCardStyle = useMemo<React.CSSProperties>(() => {
    if (transitionState === 'hover') {
      return {
        transform: `translateY(${direction * 500}px)`,
        opacity: 0,
        transition: 'none',
      };
    }
    if (transitionState === 'animating') {
      return {
        transform: 'translateY(0)',
        opacity: 1,
        transition: `transform ${animDuration}ms ease, opacity ${animDuration}ms ease`,
      };
    }
    return {};
  }, [transitionState, direction, animDuration]);

  const finishAnimation = useCallback((index: number) => {
    setCurrentIndex(index);
    setIncomingIndex(null);
    setTransitionState(null);
  }, []);

  const selectFeature = useCallback(
    (index: number, duration = ANIM_DURATION, forceDirection?: -1 | 1) => {
      if (isAnimatingRef.current || index === currentIndexRef.current) return;

      setAnimDuration(duration);
      const dir = forceDirection ?? (index < currentIndexRef.current ? -1 : 1);
      setDirection(dir);

      const wasPreloaded =
        transitionStateRef.current === 'hover' && incomingIndexRef.current === index;
      setIncomingIndex(index);

      if (wasPreloaded) {
        setTransitionState('animating');
      } else {
        setTransitionState('hover');
        requestAnimationFrame(() => {
          setTransitionState('animating');
        });
      }

      setTimeout(() => finishAnimation(index), duration);
    },
    [finishAnimation],
  );

  const onListItemHover = useCallback((index: number) => {
    if (index === currentIndexRef.current) {
      isListHoveredRef.current = true;
      return;
    }
    if (isAnimatingRef.current) return;
    setDirection(index < currentIndexRef.current ? -1 : 1);
    setIncomingIndex(index);
    setTransitionState('hover');
  }, []);

  const onListItemLeave = useCallback((index: number) => {
    if (index === currentIndexRef.current) {
      isListHoveredRef.current = false;
      return;
    }
    if (isAnimatingRef.current) return;
    if (incomingIndexRef.current === index) {
      setIncomingIndex(null);
      setTransitionState(null);
    }
  }, []);

  // Auto-advance timer
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(() => {
        if (!isListHoveredRef.current && !isAnimatingRef.current) {
          const next = (currentIndexRef.current + 1) % features.length;
          selectFeature(next, AUTO_ANIM_DURATION, 1);
        }
        schedule();
      }, AUTO_ADVANCE_INTERVAL);
    };

    schedule();
    return () => clearTimeout(timer);
  }, [features.length, selectFeature]);

  const renderCard = (feature: Feature) => {
    if (feature.previewImage) {
      return (
        <img
          src={feature.previewImage}
          alt={feature.headline}
          className={styles.carouselCardImage}
        />
      );
    }
    return (
      <div className={styles.carouselPlaceholder}>
        <div className={styles.carouselPlaceholderIcon}>
          <div className={styles.carouselPlaceholderIconInner} />
        </div>
        <p className={styles.carouselPlaceholderText}>{feature.headline}</p>
      </div>
    );
  };

  return (
    <div className={styles.carouselWrapper}>
      {/* Left column */}
      <div className={styles.carouselLeft}>
        <div className={styles.carouselTitleGroup}>
          <h1 className={styles.carouselTitle}>{title}</h1>
        </div>

        {description && <p className={styles.carouselDescription}>{description}</p>}

        {/* Feature list */}
        <ul className={styles.featureList}>
          {features.map((feature, index) => (
            <li
              key={feature.id}
              className={cx(styles.featureItem, index === currentIndex && styles.featureItemActive)}
              onMouseEnter={() => onListItemHover(index)}
              onMouseLeave={() => onListItemLeave(index)}
              onClick={() => selectFeature(index)}
            >
              {feature.headline}
            </li>
          ))}
        </ul>

        {/* CTA slot — rendered as children */}
        {children && <div className={styles.carouselCta}>{children}</div>}
      </div>

      {/* Right column — animated cards */}
      <div className={styles.carouselRight}>
        {/* Current card */}
        <div className={styles.carouselCard}>
          <div className={styles.carouselCardInner} style={currentCardStyle}>
            {renderCard(currentFeature)}
          </div>
        </div>

        {/* Incoming card */}
        {incomingFeature && (
          <div className={styles.carouselCard}>
            <div className={styles.carouselCardInner} style={incomingCardStyle}>
              {renderCard(incomingFeature)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
