import { Service } from 'services/core/service';
import { IObsListOption } from 'components/obs/inputs/ObsInput';
import {
  SimpleStreamingFactory,
  AdvancedStreamingFactory,
  SimpleRecordingFactory,
  AdvancedRecordingFactory,
  ERecordingFormat,
} from '../../../../obs-api';

/**
 * The module.ts in obs-studio-node is out of sync with module.d.ts and is
 * missing getAvailableEncoders and IEncoderOption.  TypeScript resolves
 * .ts over .d.ts, so we declare the shapes we need locally.
 */
interface IEncoderOption {
  title: string;
  name: string;
}

interface IWithAvailableEncoders {
  getAvailableEncoders(): IEncoderOption[];
}

function mapEncoders(encoders: IEncoderOption[]): IObsListOption<string>[] {
  return encoders.map(e => ({ description: e.title, value: e.name }));
}

export class EncoderQueryService extends Service {
  getAvailableStreamingEncoders(
    mode: 'Simple' | 'Advanced',
    streamSettings?: Record<string, any>,
  ): IObsListOption<string>[] {
    try {
      if (mode === 'Simple') {
        const instance = SimpleStreamingFactory.create();
        try {
          const encoders = ((instance as unknown) as IWithAvailableEncoders).getAvailableEncoders();
          return mapEncoders(encoders);
        } finally {
          SimpleStreamingFactory.destroy(instance);
        }
      } else {
        const instance = AdvancedStreamingFactory.create();
        try {
          const encoders = ((instance as unknown) as IWithAvailableEncoders).getAvailableEncoders();
          return mapEncoders(encoders);
        } finally {
          AdvancedStreamingFactory.destroy(instance);
        }
      }
    } catch (e: unknown) {
      console.error('Error querying available streaming encoders', e);
      return [];
    }
  }

  getAvailableRecordingEncoders(
    mode: 'Simple' | 'Advanced',
    format: ERecordingFormat,
  ): IObsListOption<string>[] {
    try {
      if (mode === 'Simple') {
        const instance = SimpleRecordingFactory.create();
        try {
          instance.format = format;
          const encoders = ((instance as unknown) as IWithAvailableEncoders).getAvailableEncoders();
          return mapEncoders(encoders);
        } finally {
          SimpleRecordingFactory.destroy(instance);
        }
      } else {
        const instance = AdvancedRecordingFactory.create();
        try {
          instance.format = format;
          const encoders = ((instance as unknown) as IWithAvailableEncoders).getAvailableEncoders();
          return mapEncoders(encoders);
        } finally {
          AdvancedRecordingFactory.destroy(instance);
        }
      }
    } catch (e: unknown) {
      console.error('Error querying available recording encoders', e);
      return [];
    }
  }
}
