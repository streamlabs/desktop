function isOnlyNumberOrDot(str: string): boolean {
  return /^[\d.]+$/.test(str);
}

// streaming URLから domain の一部を抽出する
// eg. "rtmp://kliveorigin.dmc.nico/named_input" -> "dmc"
export function extractPlatform(streamingURL: string): string {
  try {
    // URL は rtmp: だとhostnameを抽出してくれないためhttpに置換する
    const u = new URL(streamingURL.replace(/rtmps?:\/\//, 'http://'));
    if (isOnlyNumberOrDot(u.hostname)) {
      // IPアドレスは 先頭の2つの値までを返す
      return u.hostname.split('.').slice(0, 2).join('.');
    }

    const components = u.hostname.split('.');
    if (components.length >= 2) {
      return components[components.length - 2]; // second level domain
    }

    return streamingURL;
  } catch (e) {
    console.warn(`extractPlatform(${JSON.stringify(streamingURL)}): URL() failed`, e);
    return streamingURL;
  }
}
