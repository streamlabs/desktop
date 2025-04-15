import TsxComponent, { createProps } from 'components/tsx-component';
import { Component, Prop } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { TransitionsService } from 'services/transitions';
import { ScenesService } from 'services/scenes';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';
import { $t } from 'services/i18n';
import { EditorCommandsService } from 'services/editor-commands';
import { metadata } from './shared/inputs';

class SceneTransitionProps {
  connectionId: string = '';
}

@Component({ props: createProps(SceneTransitionProps) })
export default class SceneTransitions extends TsxComponent<SceneTransitionProps> {
  @Inject() transitionsService: TransitionsService;
  @Inject() scenesService: ScenesService;
  @Inject() private editorCommandsService: EditorCommandsService;

  get fromSceneModel(): string {
    return this.connection.fromSceneId;
  }

  setFromSceneModel(value: string) {
    this.editorCommandsService.executeCommand('EditConnectionCommand', this.props.connectionId, {
      fromSceneId: value,
    });
  }

  get toSceneModel(): string {
    return this.connection.toSceneId;
  }

  setToSceneModel(value: string) {
    this.editorCommandsService.executeCommand('EditConnectionCommand', this.props.connectionId, {
      toSceneId: value,
    });
  }

  get transitionModel(): string {
    return this.connection.transitionId;
  }

  setTransitionModel(value: string) {
    this.editorCommandsService.executeCommand('EditConnectionCommand', this.props.connectionId, {
      transitionId: value,
    });
  }

  get connection() {
    return this.transitionsService.state.connections.find(
      conn => conn.id === this.props.connectionId,
    );
  }

  get sceneOptions() {
    return [
      { title: $t('All'), value: 'ALL' },
      ...this.scenesService.views.scenes.map(scene => ({
        title: scene.name,
        value: scene.id,
      })),
    ];
  }

  get transitionOptions() {
    return this.transitionsService.state.transitions.map(transition => ({
      title: transition.name,
      value: transition.id,
    }));
  }

  render() {
    return (
      <div>
        <VFormGroup
          value={this.fromSceneModel}
          onInput={this.setFromSceneModel}
          data-name="BeginningScene"
          metadata={metadata.list({
            title: $t('Beginning Scene'),
            name: 'from',
            options: this.sceneOptions,
          })}
        />
        <VFormGroup
          value={this.transitionModel}
          onInput={this.setTransitionModel}
          data-name="SceneTransition"
          metadata={metadata.list({
            title: $t('Scene Transition'),
            name: 'transition',
            options: this.transitionOptions,
          })}
        />
        <VFormGroup
          value={this.toSceneModel}
          onInput={this.setToSceneModel}
          data-name="EndingScene"
          metadata={metadata.list({
            title: $t('Ending Scene'),
            name: 'to',
            options: this.sceneOptions,
          })}
        />
      </div>
    );
  }
}
