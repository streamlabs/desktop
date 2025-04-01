import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { FONT_CACHE_DIRECTORY } from '../constants';

export class FontLoader {
  private static instance: FontLoader;
  private fontCache: Map<string, string>;
  private fontCacheDir: string;

  private constructor() {
    this.fontCache = new Map<string, string>();
    this.fontCacheDir = FONT_CACHE_DIRECTORY;

    // Ensure cache directory exists
    if (!fs.existsSync(this.fontCacheDir)) {
      fs.mkdirSync(this.fontCacheDir, { recursive: true });
    }
  }

  public static getInstance(): FontLoader {
    if (!FontLoader.instance) {
      FontLoader.instance = new FontLoader();
    }
    return FontLoader.instance;
  }

  /**
   * Loads a Google Font and returns it as a base64 string
   * @param fontFamily The name of the font family to load
   * @returns A base64 string representation of the font or null if loading failed
   */
  public async loadGoogleFont(fontFamily: string): Promise<string | null> {
    try {
      // Check if font is already in memory cache
      if (this.fontCache.has(fontFamily)) {
        return this.fontCache.get(fontFamily) || null;
      }

      // Create a hash of the font name for file caching
      const fontHash = crypto.createHash('md5').update(fontFamily).digest('hex');
      const cachePath = path.join(this.fontCacheDir, `${fontHash}.font`);

      // Check if font exists in file cache
      if (fs.existsSync(cachePath)) {
        const cachedFont = fs.readFileSync(cachePath, 'utf8');
        this.fontCache.set(fontFamily, cachedFont);
        return cachedFont;
      }

      // Format the font name for the Google Fonts API (replace spaces with +)
      const formattedFontName = fontFamily.replace(/\s+/g, '+');
      const googleFontUrl = `https://fonts.googleapis.com/css2?family=${formattedFontName}:wght@400;700&display=swap`;
      console.log(googleFontUrl);

      // Request the CSS file from Google Fonts
      const response = await axios.get(googleFontUrl);

      // Extract the font URL from the CSS
      const cssContent = response.data;
      const fontUrlMatch = cssContent.match(/url\(([^)]+\.woff2)\)/);
      console.log(fontUrlMatch);

      if (!fontUrlMatch || !fontUrlMatch[1]) {
        console.error('Failed to extract font URL from CSS');
        return null;
      }

      // Download the actual font file
      const fontUrl = fontUrlMatch[1];
      const fontResponse = await axios.get(fontUrl, { responseType: 'arraybuffer' });
      const fontBuffer = Buffer.from(fontResponse.data);

      // Convert to base64
      const base64Font = `data:font/woff2;base64,${fontBuffer.toString('base64')}`;

      // Cache the result
      this.fontCache.set(fontFamily, base64Font);
      fs.writeFileSync(cachePath, base64Font);

      return base64Font;
    } catch (error: unknown) {
      console.error('Error loading Google Font:', error);
      return null;
    }
  }
}
