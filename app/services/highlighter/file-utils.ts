import * as fs from 'fs-extra';
export function extractDateTimeFromPath(filePath: string): string | undefined {
  try {
    const parts = filePath.split(/[/\\]/);
    const fileName = parts[parts.length - 1];
    const dateTimePart = fileName.split('.')[0];
    return dateTimePart;
  } catch (error: unknown) {
    return undefined;
  }
}

export function fileExists(file: string): boolean {
  return fs.existsSync(file);
}
