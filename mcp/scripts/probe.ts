/**
 * Dev CLI. No MCP involved -- proves the pipe, framing, bootstrap and promise
 * correlation independently of the server.
 *
 *   npm run probe -- ScenesService activeScene
 *   npm run probe -- StreamingService prepopulateInfo
 *   npm run probe -- ScenesService makeSceneActive '"<sceneId>"'
 *
 * Trailing args are parsed as JSON and passed positionally.
 */
import { DesktopClient } from '../src/desktop/client.js';
import { redact } from '../src/desktop/redact.js';

async function main() {
  const [resource, method, ...rawArgs] = process.argv.slice(2);
  if (!resource || !method) {
    console.error('usage: probe <Resource> <method> [jsonArg...]');
    process.exit(2);
  }

  const args = rawArgs.map(a => {
    try {
      return JSON.parse(a);
    } catch {
      return a;
    }
  });

  const client = new DesktopClient();
  const started = Date.now();
  try {
    const result = await client.request(resource, method, args);
    const { value, redactedFields } = redact(result);
    // This is a CLI, not the MCP server -- stdout is fine here.
    console.log(JSON.stringify(value, null, 2));
    console.error(`\nok in ${Date.now() - started}ms (redacted ${redactedFields} field(s))`);
  } catch (e) {
    console.error(`FAILED after ${Date.now() - started}ms:`, e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

void main();
