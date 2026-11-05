import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { ApiClient, getApiClient } from '../helpers/api-client';
import { IJsonRpcResponse } from '../../app/services/api/jsonrpc';
import { ScenesService } from '../../app/services/api/external-api/scenes';
import { sleep } from '../helpers/sleep';
import { cloneDeep } from 'lodash';
import * as net from 'net';

useWebdriver();

// Test all API requests that streamdeck device does right after connection
// tested on Streamdeck v4.5.0
test('Connect streamdeck device', async t => {
  const api = await getApiClient();

  api.sendJson(
    '{"id":11,"jsonrpc":"2.0","method":"makeSceneActive","params":{"args":["scene_2f630094-c23f-4e5c-b311-6bd2982ea43c"],"resource":"ScenesService"}}\n' +
      '{"id":34,"jsonrpc":"2.0","method":"SetPushToProgramInStudioMode","params":{"args":[false],"resource":"StudioModeService.studioModeStatusChange"}}\n' +
      '{"id":26,"jsonrpc":"2.0","method":"streamingStatusChange","params":{"resource":"StreamingService"}}\n' +
      '{"id":33,"jsonrpc":"2.0","method":"recordingStatusChange","params":{"resource":"StreamingService"}}\n' +
      '{"id":30,"jsonrpc":"2.0","method":"collectionSwitched","params":{"resource":"SceneCollectionsService"}}\n' +
      '{"id":28,"jsonrpc":"2.0","method":"collectionAdded","params":{"resource":"SceneCollectionsService"}}\n' +
      '{"id":29,"jsonrpc":"2.0","method":"collectionRemoved","params":{"resource":"SceneCollectionsService"}}\n' +
      '{"id":32,"jsonrpc":"2.0","method":"collectionUpdated","params":{"resource":"SceneCollectionsService"}}\n' +
      '{"id":17,"jsonrpc":"2.0","method":"sceneSwitched","params":{"resource":"ScenesService"}}\n' +
      '{"id":18,"jsonrpc":"2.0","method":"sceneAdded","params":{"resource":"ScenesService"}}\n' +
      '{"id":19,"jsonrpc":"2.0","method":"sceneRemoved","params":{"resource":"ScenesService"}}\n' +
      '{"id":20,"jsonrpc":"2.0","method":"sourceAdded","params":{"resource":"SourcesService"}}\n' +
      '{"id":21,"jsonrpc":"2.0","method":"sourceRemoved","params":{"resource":"SourcesService"}}\n' +
      '{"id":22,"jsonrpc":"2.0","method":"sourceUpdated","params":{"resource":"SourcesService"}}\n' +
      '{"id":23,"jsonrpc":"2.0","method":"itemAdded","params":{"resource":"ScenesService"}}\n' +
      '{"id":24,"jsonrpc":"2.0","method":"itemRemoved","params":{"resource":"ScenesService"}}\n' +
      '{"id":25,"jsonrpc":"2.0","method":"itemUpdated","params":{"resource":"ScenesService"}}\n' +
      '{"id":8,"jsonrpc":"2.0","method":"fetchSceneCollectionsSchema","params":{"resource":"SceneCollectionsService"}}\n' +
      '{"id":31,"jsonrpc":"2.0","method":"getModel","params":{"resource":"StreamingService"}}',
  );

  await waitForResponse(t, api, [
    {
      id: 11,
      result: false,
      jsonrpc: '2.0',
    },
    {
      id: 34,
      jsonrpc: '2.0',
      error: {
        code: -32602,
        message: 'INVALID_PARAMS resource not found: StudioModeService.studioModeStatusChange',
      },
    },
    {
      id: 26,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'StreamingService.streamingStatusChange',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 33,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'StreamingService.recordingStatusChange',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 30,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'SceneCollectionsService.collectionSwitched',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 28,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'SceneCollectionsService.collectionAdded',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 29,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'SceneCollectionsService.collectionRemoved',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 32,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'SceneCollectionsService.collectionUpdated',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 17,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'ScenesService.sceneSwitched',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 18,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'ScenesService.sceneAdded',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 19,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'ScenesService.sceneRemoved',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 20,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'SourcesService.sourceAdded',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 21,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'SourcesService.sourceRemoved',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 22,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'SourcesService.sourceUpdated',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 23,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'ScenesService.itemAdded',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 24,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'ScenesService.itemRemoved',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 25,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'ScenesService.itemUpdated',
        emitter: 'STREAM',
      },
      jsonrpc: '2.0',
    },
    {
      id: 8,
      result: {
        _type: 'SUBSCRIPTION',
        resourceId: 'b1d69785-22bb-436c-85b5-a987a94c2929',
        emitter: 'PROMISE',
      },
      jsonrpc: '2.0',
    },
    {
      id: 31,
      result: {
        streamingStatus: 'offline',
        streamingStatusTime: '2020-04-17T05:53:59.773Z',
        recordingStatus: 'offline',
        recordingStatusTime: '2020-04-17T05:53:59.773Z',
        replayBufferStatus: 'offline',
        replayBufferStatusTime: '2020-04-17T05:53:59.773Z',
        selectiveRecording: false,
      },
      jsonrpc: '2.0',
    },
    {
      id: null as any,
      result: {
        _type: 'EVENT',
        emitter: 'PROMISE',
        data: [
          {
            id: 'd872ed8f-9dd0-40ad-9399-9435041355fc',
            name: 'Scenes',
            scenes: [
              {
                id: 'scene_1541abb9-cd84-43b7-984c-d91c4bd129b2',
                name: 'Scene',
                sceneItems: [] as any[],
              },
            ],
            sources: [
              {
                id: 'wasapi_output_capture_4645f893-4e31-4537-9145-de5ae2ec0f1d',
                name: 'Desktop Audio',
                type: 'wasapi_output_capture',
                channel: 1,
              },
              {
                id: 'wasapi_input_capture_bc6f4a62-c59c-4d80-8cfe-ad9dffe27278',
                name: 'Mic/Aux',
                type: 'wasapi_input_capture',
                channel: 3,
              },
            ],
          },
        ],
        resourceId: 'b1d69785-22bb-436c-85b5-a987a94c2929',
        isRejected: false,
      },
      jsonrpc: '2.0',
    },
  ]);

  api.sendJson(
    '{"id":27,"jsonrpc":"2.0","method":"activeCollection","params":{"resource":"SceneCollectionsService"}}',
  );
  await waitForResponse(t, api, [
    {
      id: 27,
      jsonrpc: '2.0',
      result: {
        id: '7051efff-b1df-4a38-ad4c-a883c37ebad3',
        name: 'Scenes',
      },
    },
  ]);

  api.sendJson(
    '{"id":9,"jsonrpc":"2.0","method":"getScenes","params":{"args":[""],"resource":"ScenesService"}}\n' +
      '{"id":10,"jsonrpc":"2.0","method":"getSources","params":{"args":[""],"resource":"SourcesService"}}\n' +
      '{"id":12,"jsonrpc":"2.0","method":"activeSceneId","params":{"resource":"ScenesService"}}',
  );

  await waitForResponse(t, api, [
    {
      id: 9,
      jsonrpc: '2.0',
      result: [],
    },
    {
      id: 10,
      jsonrpc: '2.0',
      result: [],
    },
    {
      id: 12,
      jsonrpc: '2.0',
      result: ['scene_2f630094-c23f-4e5c-b311-6bd2982ea43c'],
    },
  ]);

  t.pass();
});

test('Malformed request disconnects the client', async t => {
  const api = await getApiClient();
  const scenesService = api.getResource<ScenesService>('ScenesService');
  const sceneName = 'Sent after disconnect';

  const socket = net.connect({ port: 28194, host: '127.0.0.1', allowHalfOpen: true });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject('Could not connect to the TCP API'), 5000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('error', e => {
      clearTimeout(timeout);
      reject(e);
    });
  });
  socket.on('error', () => {});
  // 'end' is only emitted once the error response we get back has been read
  socket.resume();

  // the server should drop us as soon as it sees a line that isn't JSON-RPC
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject('Server did not close the connection'), 5000);
    const onClosed = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.once('end', onClosed);
    socket.once('close', onClosed);
    socket.write('POST / HTTP/1.1\r\nHost: 127.0.0.1:28194\r\n\r\n');
  });

  // keep sending from our side of the connection, this must not reach the API
  socket.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'createScene',
      params: { resource: 'ScenesService', args: [sceneName] },
    }) + '\n',
  );
  await sleep(1000);
  socket.destroy();

  t.false(scenesService.getScenes().some(scene => scene.name === sceneName));
});

/**
 * wait for all response messages and compare with expected results
 */
async function waitForResponse(
  t: TExecutionContext,
  api: ApiClient,
  expectedMessages: IJsonRpcResponse<any>[],
) {
  expectedMessages = cloneDeep(expectedMessages);
  await new Promise<void>((resolve, reject) => {
    api.messageReceived.subscribe(message => {
      const messageInd = expectedMessages.findIndex(mess => mess.id === message.id);
      if (messageInd === -1) return;
      const expectedMessage = expectedMessages[messageInd];

      // compare received and expected message
      // don't check the response data at the moment, check only if request was succeeded or not
      if (expectedMessage.error) t.truthy(message.error);
      if (expectedMessage.result) t.truthy(message.result);
      if (expectedMessage.result && expectedMessage.result['isRejected'] !== void 0) {
        t.deepEqual(expectedMessage.result['isRejected'], message.result['isRejected']);
      }

      // remove message from the waitlist and stop waiting new messages if waitlist is empty
      expectedMessages.splice(messageInd, 1);
      if (!expectedMessages.length) resolve();
    });

    // setup waiting timeout
    setTimeout(
      () => reject(`Messages have not been received ${JSON.stringify(expectedMessages, null, 2)}`),
      5000,
    );
  });
}
