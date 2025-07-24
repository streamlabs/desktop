export interface IThemeMetadata {
  data: {
    id: number;
    name: string;
    custom_images: Dictionary<string>;
    designer?: {
      name: string;
      avatar: string;
      website: string;
    };
  };
}

// churn count: 2, if we need to change this one more time we're gonna need an API :D
export const THEME_METADATA = {
  FREE: {
    // Purple Burst 1658
    2639: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/5a2ad75/5a2ad75.overlay',
    // Streamlabs Neon 1645
    2624: 'https://cdn.streamlabs.com/marketplace/overlays/4921216/483af56/483af56.overlay',
    // Streamlabs Dark Mode 1583
    2559: 'https://cdn.streamlabs.com/marketplace/overlays/4921216/1b2f6cc/1b2f6cc.overlay',
    // Streamlabs Light Mode 1584
    2560: 'https://cdn.streamlabs.com/marketplace/overlays/4921216/fb61932/fb61932.overlay',
    // Red Glitch 1673
    2656: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/9259e55/9259e55.overlay',
    // Midnight Red 1674
    2657: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/985817a/985817a.overlay',
  },
  PAID: {
    // Waves (paid version), free: 3216
    2183: 'https://cdn.streamlabs.com/marketplace/overlays/439338/8164789/8164789.overlay',
    // Esports Legacy (free)
    3010: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/30a5873/30a5873.overlay',
    // Scythe (paid version), free: 2561
    3287: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/de716b6/de716b6.overlay',
    // Neon Pixel (paid version), free: 2574
    1445: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/fdb4d16/fdb4d16.overlay',
    // Talon (paid version), free: 1207
    1289: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/c5f35e1/c5f35e1.overlay',
    // Cyber Nights
    3872: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/249fcfe/249fcfe.overlay',
  },
};
