import { ENotificationType } from '../notifications/notifications-api';
import type { INotificationOptions } from '../notifications/notifications-api';

const RESOLUTION_CHANGE_SIGNAL = 'enhanced_broadcasting_resolution_change';

export const RESOLUTION_CHANGE_NOTIFICATION_CODE =
  'TWITCH_ENHANCED_BROADCASTING_RESOLUTION_CHANGE';

type TCanvas = 'horizontal' | 'vertical';

interface IResolutionChange {
  canvas: TCanvas;
  width: number;
  height: number;
}

interface IResolutionChangePayload {
  resolutionChanges: IResolutionChange[];
}

interface IResolutionChangeSignal {
  type?: string;
  signal: string;
  error?: string;
}

interface IResolutionChangeNotification {
  code: string;
  message: string;
  type: ENotificationType;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isSupportedCanvas(value: unknown): value is TCanvas {
  return value === 'horizontal' || value === 'vertical';
}

function normalizeResolutionChange(value: unknown): IResolutionChange | null {
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

function sortResolutionChanges(resolutionChanges: IResolutionChange[]): IResolutionChange[] {
  const canvasOrder: Record<TCanvas, number> = {
    horizontal: 0,
    vertical: 1,
  };

  return [...resolutionChanges].sort((a, b) => canvasOrder[a.canvas] - canvasOrder[b.canvas]);
}

function isResolutionChangeSignal(info: IResolutionChangeSignal): boolean {
  if (info.type && info.type !== 'streaming') return false;

  return info.signal === RESOLUTION_CHANGE_SIGNAL && !!info.error;
}

function parseResolutionChangeSignal(
  info: IResolutionChangeSignal,
): IResolutionChangePayload | null {
  if (!isResolutionChangeSignal(info)) return null;

  try {
    const payload = JSON.parse(info.error);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

    const changes = (payload as { resolution_changes?: unknown }).resolution_changes;
    if (!Array.isArray(changes) || changes.length === 0) return null;

    const seenCanvases = new Set<TCanvas>();
    const resolutionChanges: IResolutionChange[] = [];
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

function formatResolution({ width, height }: IResolutionChange): string {
  return `${width}\u00d7${height}`;
}

function formatCanvasResolution(change: IResolutionChange): string {
  return `${formatResolution(change)} for the ${change.canvas} canvas`;
}

function getResolutionChangeNotification(
  payload: IResolutionChangePayload,
): IResolutionChangeNotification | null {
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
    code: RESOLUTION_CHANGE_NOTIFICATION_CODE,
    message,
    type: ENotificationType.INFO,
  };
}

export function createResolutionChangeNotification(
  info: IResolutionChangeSignal,
): INotificationOptions | null {
  const payload = parseResolutionChangeSignal(info);
  if (!payload) return null;

  const notification = getResolutionChangeNotification(payload);
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
