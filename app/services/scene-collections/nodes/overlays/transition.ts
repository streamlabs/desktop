import { Node } from '../node';
import { ETransitionType, TransitionsService } from 'services/transitions';
import { Inject } from 'services/core/injector';
import { TObsValue } from 'components/obs/inputs/ObsInput';
import uniqueId from 'lodash/uniqueId';
import path from 'path';
import fs from 'fs';
import { $t } from 'services/i18n';

interface ITransition {
  id: string;
  name: string;
  type: ETransitionType;
  duration: number;
  settings: Dictionary<TObsValue>;
}

interface IConnection {
  fromSceneId: string;
  toSceneId: string;
  transitionId: string;
}

interface ISchema {
  transitions: ITransition[];
  connections: IConnection[];
  defaultTransitionId: string;
}

interface IContext {
  assetsPath: string;
}

export class TransitionNode extends Node<ISchema, IContext> {
  schemaVersion = 2;

  @Inject() transitionsService: TransitionsService;

  async save(context: IContext) {
    const transitions = await Promise.all(
      this.transitionsService.state.transitions.map(async transition => {
        const settings = { ...this.transitionsService.getSettings(transition.id) };

        if (transition.type === 'obs_stinger_transition' && settings.path) {
          const filePath = settings.path as string;
          const newFileName = `${uniqueId()}${path.parse(filePath).ext}`;
          const destination = path.join(context.assetsPath, newFileName);
          const input = fs.createReadStream(filePath);
          const output = fs.createWriteStream(destination);

          await new Promise(resolve => {
            output.on('close', resolve);
            input.pipe(output);
          });

          settings.path = newFileName;
        }

        return {
          id: transition.id,
          name: transition.name,
          type: transition.type,
          duration: transition.duration,
          settings,
        };
      }),
    );

    this.data = {
      transitions,
      connections: this.transitionsService.state.connections.map(connection => ({
        fromSceneId: connection.fromSceneId,
        toSceneId: connection.toSceneId,
        transitionId: connection.transitionId,
      })),
      defaultTransitionId: this.transitionsService.state.defaultTransitionId,
    };
  }

  async load(context: IContext) {
    this.transitionsService.deleteAllTransitions();

    this.data.transitions.forEach(transition => {
      const settings = { ...transition.settings };

      if (transition.type === 'obs_stinger_transition' && settings.path) {
        settings.path = path.join(context.assetsPath, settings.path as string);
      }

      this.transitionsService.createTransition(transition.type, transition.name, {
        id: transition.id,
        settings,
        duration: transition.duration,
      });
    });

    this.transitionsService.deleteAllConnections();
    this.data.connections.forEach(connection => {
      this.transitionsService.addConnection(
        connection.fromSceneId,
        connection.toSceneId,
        connection.transitionId,
      );
    });

    if (this.data.defaultTransitionId) {
      this.transitionsService.setDefaultTransition(this.data.defaultTransitionId);
    }
  }

  migrate(version: number) {
    // Migrate from V1: single global transition stored at the top level
    if (version === 1) {
      this.data.transitions = [
        {
          id: null,
          name: $t('Global Transition'),
          // TODO: index
          // @ts-ignore
          type: this.data['type'],
          // TODO: index
          // @ts-ignore
          duration: this.data['duration'],
          // TODO: index
          // @ts-ignore
          settings: this.data['settings'] || {},
        },
      ];
      this.data.connections = [];
      this.data.defaultTransitionId = null;
    }
  }
}
