/**
 * This code allows to execute API requests from a terminal.
 * Tests run this code in separated process via `spawnSync` to emulate the synchronous nature of our API.
 * If this solution will become too slow we can use for example synchronous http/ajax requests instead.
 * @example
 * node cmd-client.js ScenesService getScenes
 */
import { getApiClient } from './api-client';

// prevents logs from other parts of code to be sent in stdout
console.log = () => {};

!(async function () {
  const resource = process.argv[2];
  const method = process.argv[3];
  const args = process.argv.slice(4);

  // parse arguments
  args.forEach((arg, ind) => {
    if (arg.charAt(0) === '"') {
      args[ind] = arg.substring(1, arg.length - 1);
    } else {
      args[ind] = JSON.parse(args[ind]);
    }
  });

  const client = await getApiClient();
  client
    .request(resource, method, ...args)
    .then(response => {
      let responseStr = '';
      if (response === void 0) {
        responseStr = 'true';
      } else {
        responseStr = JSON.stringify(response);
      }
      process.stdout.write(responseStr);
    })
    .catch(error => {
      process.stderr.write(JSON.stringify(error));
    })
    .then(() => {
      client.disconnect();
    });
})();
