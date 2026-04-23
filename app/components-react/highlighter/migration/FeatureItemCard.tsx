import React from 'react';
import styles from './FeatureItemCard.m.less';

interface IFeatureItemCardProps {
  topColor?: string;
  bottomColor?: string;
  headline?: string;
  description?: string;
  imageUrl?: string;
  verticalImageUrl?: string;
  videoUrl?: string;
  blobColor?: string;
  iconUrl?: string;
  children?: React.ReactNode;
}

export default function FeatureItemCard(props: IFeatureItemCardProps) {
  const {
    topColor = '#1a1a2e',
    bottomColor = '#16213e',
    headline,
    description,
    imageUrl,
    verticalImageUrl,
    videoUrl,
    blobColor,
    iconUrl,
    children,
  } = props;

  const gradientStyle: React.CSSProperties = {
    background: `linear-gradient(to bottom, ${topColor}, ${bottomColor})`,
  };

  return (
    <div className={styles.cardGradient} style={gradientStyle}>
      {blobColor && <div className={styles.blob} style={{ background: blobColor }} />}

      {(headline || description) && (
        <div className={styles.cardContent}>
          <div className={styles.cardHeader}>
            {iconUrl && (
              <div className={styles.featureIconBadge}>
                <img src={iconUrl} alt="" className={styles.iconImage} />
              </div>
            )}
            {headline && <h3 className={styles.headline}>{headline}</h3>}
          </div>
          {description && <p className={styles.description}>{description}</p>}
        </div>
      )}

      {children || (
        <CardMedia
          videoUrl={videoUrl}
          imageUrl={imageUrl}
          verticalImageUrl={verticalImageUrl}
          headline={headline}
        />
      )}
    </div>
  );
}

function CardMedia(props: {
  videoUrl?: string;
  imageUrl?: string;
  verticalImageUrl?: string;
  headline?: string;
}) {
  const { videoUrl, imageUrl, verticalImageUrl, headline } = props;

  if (videoUrl) {
    return (
      <div className={styles.cardMedia}>
        <video src={videoUrl} autoPlay muted loop className={styles.cardVideo} />
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className={styles.cardMedia}>
        <img src={imageUrl} alt={headline || ''} className={styles.cardImageHorizontal} />
        {verticalImageUrl && (
          <img src={verticalImageUrl} alt={headline || ''} className={styles.cardImageVertical} />
        )}
      </div>
    );
  }

  return null;
}
