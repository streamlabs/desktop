import Utils from 'services/utils';
import { authorizedHeaders, jfetch } from 'util/requests';

interface IQuotaApiResponse {
  quota_name: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface IHighlighterQuota {
  quotaName: string;
  limit: number;
  used: number;
  remaining: number;
}

export class HighlighterQuotaApi {
  private backendUrl: string;

  constructor() {
    this.backendUrl =
      Utils.getHighlighterEnvironment() === 'production'
        ? 'https://highlighter-api.streamlabs.com/'
        : 'https://highlighter-api-staging.streamlabs.com/';
  }

  async getAudioAnalysisQuota(apiToken: string): Promise<IHighlighterQuota> {
    const endpoint = new URL('/quota?name=audio_analysis', this.backendUrl).toString();
    const headers = authorizedHeaders(apiToken);
    headers.append('x-auth-provider', 'streamlabs.desktop');

    const response = await jfetch<IQuotaApiResponse>(endpoint, {
      method: 'GET',
      headers,
    });

    return {
      quotaName: response.quota_name,
      limit: response.limit,
      used: response.used,
      remaining: response.remaining,
    };
  }
}
