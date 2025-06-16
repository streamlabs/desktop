import { Node } from './node';
import { TransitionsService, ETransitionType } from 'services/transitions';
import { Inject } from 'services/core/injector';
import { TObsValue } from 'components/obs/inputs/ObsInput';
import { $t } from 'services/i18n';

interface ITransition {
  id: string;
  name: string;
  type: ETransitionType;
  duration: number;
  settings: Dictionary<TObsValue>;
  propertiesManagerSettings?: Dictionary<any>;
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

/**
 * This is the V2 transitions node that supports multiple
 * transitions and connections.
 */
export class TransitionsNode extends Node<ISchema, {}> {
  schemaVersion = 2;

  @Inject() transitionsService: TransitionsService;

  async save() {
    this.data = {
      transitions: this.transitionsService.state.transitions.map(transition => {
        return {
          id: transition.id,
          name: transition.name,
          type: transition.type,
          duration: transition.duration,
          settings: this.transitionsService.getSettings(transition.id),
          propertiesManagerSettings: this.transitionsService.getPropertiesManagerSettings(
            transition.id,
          ),
        };
      }),
      connections: this.transitionsService.state.connections.map(connection => {
        return {
          fromSceneId: connection.fromSceneId,
          toSceneId: connection.toSceneId,
          transitionId: connection.transitionId,
        };
      }),
      defaultTransitionId: this.transitionsService.state.defaultTransitionId,
    };
  }

  async load() {
    // Double check we are starting from a blank state
    this.transitionsService.deleteAllTransitions();
    this.data.transitions.forEach(transition => {
      this.transitionsService.createTransition(transition.type, transition.name, {
        id: transition.id,
        duration: transition.duration,
        settings: transition.settings,
        propertiesManagerSettings: transition.propertiesManagerSettings,
      });
    });

    // Double check we are starting from a blank state
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
    // Migrate from version 1 schemas, where we only had a single global
    // transition and no support for connections.
    if (version === 1) {
      const transition: ITransition = {
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
        settings: this.data['settings'],
        // TODO: index
        // @ts-ignore
        propertiesManagerSettings: this.data['propertiesManagerSettings'],
      };
      this.data.transitions = [transition];
      this.data.connections = [];
    }
  }
}
