import * as fs from 'fs-extra';
export function fileExists(file: string): boolean {
  return fs.existsSync(file);
}
