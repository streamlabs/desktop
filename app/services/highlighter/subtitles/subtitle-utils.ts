export function removeLinebreaksFromString(str: string) {
  return str.replace(/[\r\n]+/gm, '');
}
export function roundTime(time: number): number {
  return Math.round(time * 100) / 100;
}
export function toSrtFormat(time: number): string {
  const o = new Date(0);
  const p = new Date(time * 1000);
  return new Date(p.getTime() - o.getTime())
    .toISOString()
    .split('T')[1]
    .split('Z')[0]
    .replace('.', ',');
}
export function toVttFormat(time: number): string {
  const o = new Date(0);
  const p = new Date(time * 1000);
  return new Date(p.getTime() - o.getTime()).toISOString().split('T')[1].split('Z')[0];
}
