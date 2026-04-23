import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import styles from './MigrationNotice.m.less';
import FeatureItemCard from './FeatureItemCard';
import { $i } from 'services/utils';

const IMAGE_PATH = 'https://cdn.streamlabs.com/static/imgs/highlighter';
export interface Feature {
  id: string;
  headline: string;
  listItemTitle?: string;
  previewImage?: string;
  description?: string;
  topColor?: string;
  bottomColor?: string;
  videoUrl?: string;
  blobColor?: string;
  iconUrl?: string;
}

export const CAROUSEL_FEATURES: Feature[] = [
  {
    id: 'ai-reels',
    listItemTitle: 'Auto created reels in seconds powered by Streamlabs AI',
    headline: 'Turn 1 Recording into 10 Reels - automatically',
    topColor: '#19242A',
    bottomColor: '#19242A',
    previewImage: `${IMAGE_PATH}/create.webp`,
  },
  {
    id: 'verticaliser',
    listItemTitle: 'Recording to shorts - fully automatic',
    headline: 'Horizontal to vertical with one click',
    description: 'Convert your horizontal stream into TikTok and Instagram formats.',
    topColor: '#380E29',
    bottomColor: '#380E29',
    previewImage: `${IMAGE_PATH}/layout.webp`,
    iconUrl: `${IMAGE_PATH}/layout-icon.svg`,
    blobColor: '#FE08AD',
  },
  {
    id: 'subtitles',
    listItemTitle: 'Subtitles like the PROs',
    headline: 'Automatic subtitles',
    description: 'Add subtitles like the pros with the click of a button. Zero extra work.',
    topColor: '#0C2C52',
    bottomColor: '#0C2C52',
    previewImage: `${IMAGE_PATH}/subtitles.webp`,
    iconUrl: `${IMAGE_PATH}/subtitles-icon.svg`,
  },
  {
    id: 'sharing',
    listItemTitle: 'Grow on every platform - without effort',
    headline: 'Grow everywhere',
    description:
      'Direct sharing to YouTube, Discord and shortcuts to TikTok, Instagram or X. Grow on all platforms without effort.',
    topColor: '#280e08',
    bottomColor: '#2D1712',
    previewImage: `${IMAGE_PATH}/grow.webp`,
    iconUrl: `${IMAGE_PATH}/grow-icon.svg`,
  },
  {
    id: 'gameplay',
    listItemTitle: 'Auto-Record: Create content even when you are not live',
    headline: 'Auto record gameplay',
    description:
      'Not streaming? No problem! Your gameplay gets recorded automatically — if you want it to.',
    topColor: '#1E0101',
    bottomColor: '#1E0101',
    previewImage: `${IMAGE_PATH}/auto-record.webp`,
    blobColor: '#FF4655',
    iconUrl: `${IMAGE_PATH}/auto-record-icon.svg`,
  },
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
          requestAnimationFrame(() => {
            setTransitionState('animating');
          });
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

  const renderCard = (feature: Feature) => (
    <FeatureItemCard
      topColor={feature.topColor}
      bottomColor={feature.bottomColor}
      headline={feature.headline}
      description={feature.description}
      imageUrl={feature.previewImage}
      verticalImageUrl={feature.previewImage?.replace(/\.[^.]+$/, '-vertical.webp')}
      videoUrl={feature.videoUrl}
      blobColor={feature.blobColor}
      iconUrl={feature.iconUrl}
    />
  );

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
              {feature.listItemTitle || feature.headline}
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
