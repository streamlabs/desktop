import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import cx from 'classnames';
import styles from './MigrationNotice.m.less';
import FeatureItemCard from './FeatureItemCard';
import { $t } from 'services/i18n';

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

interface TransitionInfo {
  fromIndex: number;
  toIndex: number;
  direction: 1 | -1;
  duration: number;
}

interface CarouselState {
  activeIndex: number;
  transition: TransitionInfo | null;
}

type CarouselAction =
  | { type: 'GO_TO'; index: number; direction?: 1 | -1; duration?: number }
  | { type: 'ADVANCE'; featureCount: number }
  | { type: 'FINISH' };

function carouselReducer(state: CarouselState, action: CarouselAction): CarouselState {
  switch (action.type) {
    case 'GO_TO': {
      if (state.transition || action.index === state.activeIndex) return state;
      return {
        activeIndex: action.index,
        transition: {
          fromIndex: state.activeIndex,
          toIndex: action.index,
          direction: action.direction ?? (action.index > state.activeIndex ? 1 : -1),
          duration: action.duration ?? ANIM_DURATION,
        },
      };
    }
    case 'ADVANCE': {
      if (state.transition) return state;
      const next = (state.activeIndex + 1) % action.featureCount;
      return {
        activeIndex: next,
        transition: {
          fromIndex: state.activeIndex,
          toIndex: next,
          direction: 1,
          duration: AUTO_ANIM_DURATION,
        },
      };
    }
    case 'FINISH':
      return { ...state, transition: null };
    default:
      return state;
  }
}

interface IFeatureCarouselProps {
  title: string;
  description?: string;
  features: Feature[];
  children?: React.ReactNode;
}

export default function FeatureCarousel(props: IFeatureCarouselProps) {
  const { title, description, features, children } = props;

  const [{ activeIndex, transition }, dispatch] = useReducer(carouselReducer, {
    activeIndex: 0,
    transition: null,
  });
  const [animPhase, setAnimPhase] = useState<'prep' | 'go' | null>(null);
  const isHoveredRef = useRef(false);

  // Two-frame animation: prep (position off-screen) → go (animate in)
  useEffect(() => {
    if (!transition) {
      setAnimPhase(null);
      return;
    }

    setAnimPhase('prep');
    let card2Animation: number;
    let timer: ReturnType<typeof setTimeout>;

    const card1Animation = requestAnimationFrame(() => {
      card2Animation = requestAnimationFrame(() => {
        setAnimPhase('go');
        timer = setTimeout(() => dispatch({ type: 'FINISH' }), transition.duration);
      });
    });

    return () => {
      cancelAnimationFrame(card1Animation);
      if (card2Animation) cancelAnimationFrame(card2Animation);
      if (timer) clearTimeout(timer);
    };
  }, [transition]);

  // Auto-advance
  useEffect(() => {
    const id = setInterval(() => {
      if (!isHoveredRef.current) {
        dispatch({ type: 'ADVANCE', featureCount: features.length });
      }
    }, AUTO_ADVANCE_INTERVAL);
    return () => clearInterval(id);
  }, [features.length]);

  const outgoingStyle = useMemo<React.CSSProperties>(() => {
    if (!transition || animPhase !== 'go') return {};
    return {
      transform: `translateY(${transition.direction * -500}px)`,
      opacity: 0,
      transition: `transform ${transition.duration}ms ease, opacity ${transition.duration}ms ease`,
    };
  }, [transition, animPhase]);

  const incomingStyle = useMemo<React.CSSProperties>(() => {
    if (!transition) return {};
    if (animPhase === 'prep') {
      return {
        transform: `translateY(${transition.direction * 500}px)`,
        opacity: 0,
        transition: 'none',
      };
    }
    if (animPhase === 'go') {
      return {
        transform: 'translateY(0)',
        opacity: 1,
        transition: `transform ${transition.duration}ms ease, opacity ${transition.duration}ms ease`,
      };
    }
    return {};
  }, [transition, animPhase]);

  const outgoingFeature = transition ? features[transition.fromIndex] : null;

  const renderCard = (feature: Feature) => (
    <FeatureItemCard
      topColor={feature.topColor}
      bottomColor={feature.bottomColor}
      headline={$t(feature.headline)}
      description={feature.description ? $t(feature.description) : undefined}
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
        <ul
          className={styles.featureList}
          onMouseEnter={() => (isHoveredRef.current = true)}
          onMouseLeave={() => (isHoveredRef.current = false)}
        >
          {features.map((feature, index) => (
            <li
              key={feature.id}
              className={cx(styles.featureItem, index === activeIndex && styles.featureItemActive)}
              onClick={() => dispatch({ type: 'GO_TO', index })}
            >
              {$t(feature.listItemTitle || feature.headline)}
            </li>
          ))}
        </ul>

        {/* CTA slot — rendered as children */}
        {children && <div className={styles.carouselCta}>{children}</div>}
      </div>

      {/* Right column — animated cards */}
      <div className={styles.carouselRight}>
        {/* Outgoing card (visible only during transition) */}
        {outgoingFeature && (
          <div className={styles.carouselCard}>
            <div className={styles.carouselCardInner} style={outgoingStyle}>
              {renderCard(outgoingFeature)}
            </div>
          </div>
        )}

        {/* Active card (slides in during transition, static otherwise) */}
        <div className={styles.carouselCard}>
          <div className={styles.carouselCardInner} style={transition ? incomingStyle : {}}>
            {renderCard(features[activeIndex])}
          </div>
        </div>
      </div>
    </div>
  );
}
