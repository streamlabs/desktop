import { ENotificationType } from './notifications/notifications-api';
import type { INotificationOptions } from './notifications/notifications-api';

export const ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL =
  'enhanced_broadcasting_resolution_change';

export const ENHANCED_BROADCASTING_RESOLUTION_CHANGE_NOTIFICATION_CODE =
  'TWITCH_ENHANCED_BROADCASTING_RESOLUTION_CHANGE';

type TEnhancedBroadcastingCanvas = 'horizontal' | 'vertical';

export interface IEnhancedBroadcastingResolutionChange {
  canvas: TEnhancedBroadcastingCanvas;
  width: number;
  height: number;
}

export interface IEnhancedBroadcastingResolutionChangePayload {
  resolutionChanges: IEnhancedBroadcastingResolutionChange[];
}

interface IEnhancedBroadcastingResolutionChangeSignal {
  type?: string;
  signal: string;
  error?: string;
}

export interface IEnhancedBroadcastingResolutionChangeNotification {
  code: string;
  message: string;
  type: ENotificationType;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isSupportedCanvas(value: unknown): value is TEnhancedBroadcastingCanvas {
  return value === 'horizontal' || value === 'vertical';
}

function normalizeResolutionChange(value: unknown): IEnhancedBroadcastingResolutionChange | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const change = value as Record<string, unknown>;
  if (!isSupportedCanvas(change.canvas)) return null;
  if (!isPositiveInteger(change.width) || !isPositiveInteger(change.height)) return null;

  return {
    canvas: change.canvas,
    width: change.width,
    height: change.height,
  };
}

function sortResolutionChanges(
  resolutionChanges: IEnhancedBroadcastingResolutionChange[],
): IEnhancedBroadcastingResolutionChange[] {
  const canvasOrder: Record<TEnhancedBroadcastingCanvas, number> = {
    horizontal: 0,
    vertical: 1,
  };

  return [...resolutionChanges].sort((a, b) => canvasOrder[a.canvas] - canvasOrder[b.canvas]);
}

export function parseEnhancedBroadcastingResolutionChangeSignal(
  info: IEnhancedBroadcastingResolutionChangeSignal,
): IEnhancedBroadcastingResolutionChangePayload | null {
  if (!isEnhancedBroadcastingResolutionChangeOutputSignal(info)) return null;

  try {
    const payload = JSON.parse(info.error);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

    const changes = (payload as { resolution_changes?: unknown }).resolution_changes;
    if (!Array.isArray(changes) || changes.length === 0) return null;

    const seenCanvases = new Set<TEnhancedBroadcastingCanvas>();
    const resolutionChanges: IEnhancedBroadcastingResolutionChange[] = [];
    for (const value of changes) {
      const resolutionChange = normalizeResolutionChange(value);
      if (!resolutionChange || seenCanvases.has(resolutionChange.canvas)) return null;

      seenCanvases.add(resolutionChange.canvas);
      resolutionChanges.push(resolutionChange);
    }

    return { resolutionChanges: sortResolutionChanges(resolutionChanges) };
  } catch (_e: unknown) {
    return null;
  }
}

export function isEnhancedBroadcastingResolutionChangeOutputSignal(
  info: IEnhancedBroadcastingResolutionChangeSignal,
): boolean {
  if (info.type && info.type !== 'streaming') return false;

  return info.signal === ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL && !!info.error;
}

function formatResolution({ width, height }: IEnhancedBroadcastingResolutionChange): string {
  return `${width}\u00d7${height}`;
}

function formatCanvasResolution(change: IEnhancedBroadcastingResolutionChange): string {
  return `${formatResolution(change)} for the ${change.canvas} canvas`;
}

export function getEnhancedBroadcastingResolutionChangeNotification(
  payload: IEnhancedBroadcastingResolutionChangePayload,
): IEnhancedBroadcastingResolutionChangeNotification | null {
  const resolutionChanges = sortResolutionChanges(payload.resolutionChanges);
  if (resolutionChanges.length === 0) return null;

  const message =
    resolutionChanges.length === 1
      ? `Your resolution for the ${resolutionChanges[0].canvas} canvas has been changed to ${formatResolution(
          resolutionChanges[0],
        )} because Enhanced Broadcasting detected it as the optimal configuration for your system.`
      : `Your resolutions have been changed to ${resolutionChanges
          .map(formatCanvasResolution)
          .join(
            ' and ',
          )} because Enhanced Broadcasting detected them as the optimal configurations for your system.`;

  return {
    code: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_NOTIFICATION_CODE,
    message,
    type: ENotificationType.INFO,
  };
}

export function createEnhancedBroadcastingResolutionChangeNotificationOptions(
  payload: IEnhancedBroadcastingResolutionChangePayload,
): INotificationOptions | null {
  const notification = getEnhancedBroadcastingResolutionChangeNotification(payload);
  if (!notification) return null;

  return {
    code: notification.code,
    data: {
      resolutionChanges: payload.resolutionChanges,
    },
    lifeTime: -1,
    message: notification.message,
    singleton: true,
    type: notification.type,
  };
}
