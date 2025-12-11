export type TabKind =
  | 'add-trigger'
  | 'general'
  | 'manage-triggers'
  | 'trigger-detail';

export interface Tab {
  kind: TabKind;
  group?: string;
  triggerId?: string;
}

export function encodeTab(tab: Tab): string {
  return JSON.stringify(tab);
}

export function decodeTab(raw: string | undefined | null): Tab {
  if (!raw) return { kind: 'general' };
  try {
    return JSON.parse(raw) as Tab;
  } catch {
    return { kind: 'general' };
  }
}

export function getCurrentTab(rawTabString: string | null | undefined): Tab {
  return decodeTab(rawTabString);
}

export function setCurrentTab(kind: TabKind, opts?: { group?: string; triggerId?: string }) {
  return encodeTab({ kind, ...opts });
}
