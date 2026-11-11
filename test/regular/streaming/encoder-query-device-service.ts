import { focusMain, focusWindow } from '../../helpers/modules/core';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

/**
 * Regression coverage for startup encoder validation resetting NVENC HEVC to x264 for
 * Twitch users, with a dialog blaming their graphics drivers.
 *
 * The device encoder list was queried through the user's saved service. OSN narrows a
 * streaming instance's encoders by its service's declared codecs, and Twitch's rtmp_common
 * entry declares only H.264, so HEVC dropped out of the device list. The device query must
 * instead assign a codec-agnostic rtmp_custom service.
 *
 * These tests run the production EncoderQueryService query paths in the worker against fake
 * native factories whose instances filter encoders the way OSN does, so no output is
 * started and no encoder hardware is required.
 */

type TMode = 'Simple' | 'Advanced';

interface ICreatedService {
  type: string;
  settings: Record<string, unknown>;
  isSavedService: boolean;
}

interface IDeviceQueryResult {
  deviceCodecs: string[] | null;
  deviceServices: ICreatedService[];
  deviceAssignedServices: ICreatedService[];
  deviceInstanceFactories: string[];
  deviceDestroyedInstances: number;
  deviceDestroyedServices: number;
  savedServiceCodecs: string[] | null;
  error?: string;
}

async function runDeviceQueryWithSavedTwitch(
  t: TExecutionContext,
  mode: TMode,
): Promise<IDeviceQueryResult> {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    return (await t.context.app.client.executeAsync(
      (queryMode: TMode, done: (result: IDeviceQueryResult) => void) => {
        // This callback is serialized and run in the worker, so it must not compile to TS
        // emit helpers (object rest becomes `__rest`, which is not defined there).
        try {
          // Encoders OSN only lists when the instance's service accepts their codec.
          const serviceCheckedEncoders = new Set<string>();
          const encoder = (name: string, codec: string, serviceChecked: boolean) => {
            if (serviceChecked) serviceCheckedEncoders.add(name);
            return {
              title: name,
              name,
              id: name,
              family: name,
              preset: 'preset',
              codec,
              streaming: true,
              recording: true,
            };
          };
          const allEncoders = [
            encoder('obs_x264', 'h264', false),
            encoder('obs_nvenc_h264_tex', 'h264', true),
            encoder('obs_nvenc_hevc_tex', 'hevc', true),
            encoder('obs_nvenc_av1_tex', 'av1', true),
          ];

          interface IFakeService {
            fakeType: string;
            settings: Record<string, unknown>;
            isSavedService: boolean;
          }

          // The user's saved service: Twitch, whose rtmp_common entry declares only H.264.
          const savedService: IFakeService = {
            fakeType: 'rtmp_common',
            settings: { service: 'Twitch', server: 'rtmp://ingest.example/app', key: 'key' },
            isSavedService: true,
          };

          // Mirrors osn::EncoderUtils::isCodecAvailableForService: a service-less instance
          // drops service-checked encoders, an rtmp_common service narrows by its declared
          // codecs, and a service with no codec list falls back to rtmp_output's.
          const declaredCodecs = (service: IFakeService): string[] => {
            if (service.fakeType === 'rtmp_common' && service.settings.service === 'Twitch') {
              return ['h264'];
            }
            return ['h264', 'hevc', 'av1'];
          };
          const filterForService = (service: IFakeService | undefined) =>
            allEncoders.filter(e => {
              if (!serviceCheckedEncoders.has(e.name)) return true;
              if (!service) return false;
              return declaredCodecs(service).includes(e.codec);
            });

          const describe = (service: IFakeService): ICreatedService => ({
            type: service.fakeType,
            settings: service.settings,
            isSavedService: service.isSavedService,
          });

          let createdServices: IFakeService[] = [];
          let assignedServices: IFakeService[] = [];
          let instanceFactories: string[] = [];
          let destroyedInstances = 0;
          let destroyedServices = 0;
          const reset = () => {
            createdServices = [];
            assignedServices = [];
            instanceFactories = [];
            destroyedInstances = 0;
            destroyedServices = 0;
          };

          const instanceFactory = (label: string) => ({
            create: () => {
              instanceFactories.push(label);
              let current: IFakeService | undefined;
              return {
                get service() {
                  return current;
                },
                set service(value: IFakeService | undefined) {
                  current = value;
                  if (value) assignedServices.push(value);
                },
                getAvailableEncoders: () => filterForService(current),
              };
            },
            destroy: () => {
              destroyedInstances++;
            },
          });

          const service = (window as any).servicesManager.getResource('EncoderQueryService');
          const fixture = Object.create(Object.getPrototypeOf(service));
          fixture.streamingEncoderCache = new Map();
          fixture.recordingEncoderCache = new Map();
          fixture.nativeStreamingFactories = {
            simple: instanceFactory('Simple'),
            advanced: instanceFactory('Advanced'),
            service: {
              legacySettings: savedService,
              create: (type: string, _name: string, settings: Record<string, unknown>) => {
                const created: IFakeService = {
                  fakeType: type,
                  settings: { ...(settings ?? {}) },
                  isSavedService: false,
                };
                createdServices.push(created);
                return created;
              },
              destroy: () => {
                destroyedServices++;
              },
            },
          };

          const codecs = (encoders: { codec: string }[] | null) =>
            encoders ? encoders.map(e => e.codec) : null;

          const deviceEncoders = fixture.queryDeviceEncoders(queryMode);
          const deviceResult = {
            deviceCodecs: codecs(deviceEncoders),
            deviceServices: createdServices.map(describe),
            deviceAssignedServices: assignedServices.map(describe),
            deviceInstanceFactories: instanceFactories,
            deviceDestroyedInstances: destroyedInstances,
            deviceDestroyedServices: destroyedServices,
          };

          // Control: the same fakes queried through the saved service drop HEVC/AV1, which
          // is what the device query used to do.
          reset();
          const savedServiceEncoders = fixture.queryEncodersForPlatform(queryMode, null);

          done({
            ...deviceResult,
            savedServiceCodecs: codecs(savedServiceEncoders),
          });
        } catch (e: unknown) {
          done({
            deviceCodecs: null,
            deviceServices: [],
            deviceAssignedServices: [],
            deviceInstanceFactories: [],
            deviceDestroyedInstances: 0,
            deviceDestroyedServices: 0,
            savedServiceCodecs: null,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },
      mode,
    )) as IDeviceQueryResult;
  } finally {
    await focusMain();
  }
}

for (const mode of ['Simple', 'Advanced'] as TMode[]) {
  test(`${mode} device query assigns a codec-agnostic service with a saved Twitch service`, async t => {
    const result = await runDeviceQueryWithSavedTwitch(t, mode);

    t.falsy(result.error);

    t.deepEqual(
      result.savedServiceCodecs,
      ['h264', 'h264'],
      'control: querying through the saved Twitch service drops HEVC and AV1',
    );

    t.deepEqual(result.deviceInstanceFactories, [mode], `uses the ${mode} streaming factory`);
    t.is(result.deviceServices.length, 1, 'creates exactly one temp service');
    const [created] = result.deviceServices;
    t.is(created.type, 'rtmp_custom', 'the temp service is rtmp_custom');
    t.false('service' in created.settings, 'the temp service names no rtmp-services entry');
    t.false('server' in created.settings, 'the temp service has no server to pick a protocol');

    t.deepEqual(
      result.deviceAssignedServices,
      [created],
      'the instance is given the temp service and never the saved Twitch service',
    );
    t.deepEqual(
      result.deviceCodecs,
      ['h264', 'h264', 'hevc', 'av1'],
      'the device list keeps HEVC and AV1',
    );

    t.is(result.deviceDestroyedInstances, 1, 'the temp instance is destroyed');
    t.is(result.deviceDestroyedServices, 1, 'the temp service is destroyed');
  });
}
