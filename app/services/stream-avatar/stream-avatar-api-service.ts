import { Service } from 'services/core';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import { HostsService } from 'services/hosts';
import { authorizedHeaders, jfetch } from 'util/requests';
import Util from 'services/utils';
import type { TAutomationExport } from './engine/automations';

// Types previously in agent-socket-service — moved here as the REST client owns them now
export interface AutomationTemplateSourceBase {
  name: string;
  assetKey: string;
  downloadUrl: string;
}

export interface FfmpegTemplateSource extends AutomationTemplateSourceBase {
  type: 'ffmpeg_source';
  loop: boolean;
}

export interface ImageTemplateSource extends AutomationTemplateSourceBase {
  type: 'image_source';
}

export type AutomationTemplateSource = FfmpegTemplateSource | ImageTemplateSource;

export interface AutomationTemplateItem {
  title: string;
  description: string;
  imageUrl: string;
  gifUrl: string;
  /** Short label for the pack card chips; falls back to `title`. */
  chipLabel?: string;
  sources?: AutomationTemplateSource[];
  automation: Omit<TAutomationExport, 'id'>;
}

export interface AutomationTemplateGame {
  game: string;
  gameName: string;
  templates: AutomationTemplateItem[];
}

export type AutomationTemplateCategory = 'game' | 'event';

/**
 * A group of templates shown as one card in the picker. Game packs hold one game's templates;
 * event packs hold stream-event templates whose conditions list every platform variant.
 */
export interface AutomationTemplatePack {
  /** Unique, e.g. 'game:fortnite' or 'event:welcome-wagon'. */
  id: string;
  category: AutomationTemplateCategory;
  name: string;
  /** Condition prefix for game packs. */
  game?: string;
  /** Static card thumbnail. */
  imageUrl: string;
  /** Hover and detail preview. */
  gifUrl: string;
  /** Detail banner; falls back to `imageUrl`. */
  bannerUrl?: string;
  templates: AutomationTemplateItem[];
}

/** Maps the per-game templates response into game packs. */
export function gamesToTemplatePacks(games: AutomationTemplateGame[]): AutomationTemplatePack[] {
  return games.map(game => ({
    id: `game:${game.game}`,
    category: 'game',
    name: game.gameName,
    game: game.game,
    imageUrl: game.templates[0]?.imageUrl ?? '',
    gifUrl: game.templates[0]?.gifUrl ?? '',
    templates: game.templates,
  }));
}

/**
 * Decodes a JWT's payload segment. It is base64url and unpadded, and atob() rejects a
 * length of 1 mod 4, so restore the '=' padding before decoding.
 */
function decodeJwtPayload(jwt: string): string {
  const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
}

export class StreamAvatarApiService extends Service {
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;

  private cachedJwt: string | null = null;
  private cachedJwtExp = 0;
  private inflight: Promise<string> | null = null;

  private get apiBase(): string {
    const protocol = Util.getAvatarEnvironment() === 'local' ? 'http://' : 'https://';
    return `${protocol}${this.hostsService.streamAvatarApi}`;
  }

  /** Drop the cached JWT (call on logout so an account switch can't reuse it). */
  clearToken() {
    this.cachedJwt = null;
    this.cachedJwtExp = 0;
  }

  async getToken(forceRefresh = false): Promise<string> {
    const now = Date.now() / 1000;
    if (!forceRefresh && this.cachedJwt && this.cachedJwtExp - now > 60) {
      return this.cachedJwt;
    }

    if (this.inflight) return this.inflight;

    this.inflight = this.mintToken().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async mintToken(): Promise<string> {
    const response = await jfetch<{ token: string }>(
      new Request(`${this.apiBase}/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.userService.apiToken }),
      }),
    );

    const jwt = response.token;
    const payload = JSON.parse(decodeJwtPayload(jwt));
    this.cachedJwt = jwt;
    this.cachedJwtExp = payload.exp;
    return jwt;
  }

  async authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const makeRequest = (token: string) =>
      new Request(`${this.apiBase}${path}`, {
        ...init,
        headers: authorizedHeaders(token, new Headers({ 'Content-Type': 'application/json' })),
      });

    return await jfetch<T>(makeRequest(await this.getToken())).catch(async e => {
      if ((e as any)?.status === 401) {
        console.warn('[StreamAvatarApi] Token expired, refreshing and retrying...', { path });
        return await jfetch<T>(makeRequest(await this.getToken(true)));
      }
      throw e;
    });
  }

  // Automation CRUD

  getAutomations(): Promise<TAutomationExport[]> {
    return this.authedFetch<TAutomationExport[]>('/automations/');
  }

  getAutomationTemplates(): Promise<AutomationTemplateGame[]> {
    return this.authedFetch<AutomationTemplateGame[]>('/automations/templates');
  }

  /**
   * Game and event template packs. An API that predates packs rejects this route, so fall back
   * to the game templates it does serve and present those as game packs.
   */
  async getAutomationTemplatePacks(): Promise<AutomationTemplatePack[]> {
    try {
      return await this.authedFetch<AutomationTemplatePack[]>('/automations/template-packs');
    } catch (e: unknown) {
      console.warn('[StreamAvatarApi] Template packs unavailable, using game templates', e);
      return gamesToTemplatePacks(await this.getAutomationTemplates());
    }
  }

  getInstructions(): Promise<Record<string, string>> {
    return this.authedFetch<Record<string, string>>('/instructions/');
  }

  createAutomation(automation: Omit<TAutomationExport, 'id'>): Promise<TAutomationExport> {
    return this.authedFetch<TAutomationExport>('/automations/', {
      method: 'POST',
      body: JSON.stringify(automation),
    });
  }

  updateAutomation(
    automation: Partial<TAutomationExport> & { id: number },
  ): Promise<TAutomationExport> {
    const { id, ...body } = automation;
    return this.authedFetch<TAutomationExport>(`/automations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async deleteAutomation(id: number): Promise<void> {
    await this.authedFetch<void>(`/automations/${id}`, { method: 'DELETE' });
  }

  // Simulation

  async sendSimulationBark(conditionType: string): Promise<void> {
    await this.authedFetch<void>('/automations/simulate-bark', {
      method: 'POST',
      body: JSON.stringify({ conditionType }),
    });
  }

  // Agent fire-and-forget (desktop never reads the response — it goes to avatar sources)

  async sendInstruction(instruction: string, response: 'text' | 'tts' = 'tts'): Promise<void> {
    await this.authedFetch<void>('/agent/instruction', {
      method: 'POST',
      body: JSON.stringify({ instruction, response }),
    });
  }
}
