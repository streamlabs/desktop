import ConnectionSettings from 'components/ConnectionSettings.vue';
import ModalLayout from 'components/ModalLayout.vue';
import Tabs, { ITab } from 'components/Tabs.vue';
import TransitionSettings from 'components/TransitionSettings.vue';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { ScenesService } from 'services/scenes';
import { ETransitionType, TransitionsService } from 'services/transitions';
import { WindowsService } from 'services/windows';
import Vue from 'vue';
import VModal from 'vue-js-modal';
import { Component } from 'vue-property-decorator';

Vue.use(VModal);

@Component({
  components: {
    ModalLayout,
    TransitionSettings,
    Tabs,
    ConnectionSettings,
  },
})
export default class SceneTransitions extends Vue {
  @Inject() transitionsService: TransitionsService;
  @Inject() windowsService: WindowsService;
  @Inject() scenesService: ScenesService;

  inspectedTransition = '';
  inspectedConnection = '';

  tabs: ITab[] = [
    {
      name: $t('transitions.transitions'),
      value: 'transitions',
    },
    {
      name: $t('transitions.connections'),
      value: 'connections',
    },
  ];

  selectedTab = 'transitions';

  redundantConnectionTooltip = $t('transitions.redundantConnectionTooltip');

  get transitionsEnabled() {
    return this.scenesService.scenes.length > 1;
  }

  // TRANSITIONS

  get transitions() {
    return this.transitionsService.state.transitions;
  }

  get defaultTransitionId() {
    return this.transitionsService.state.defaultTransitionId;
  }

  addTransition() {
    const transition = this.transitionsService.createTransition(
      ETransitionType.Cut,
      $t('transitions.newTransition'),
    );
    this.editTransition(transition.id);
  }

  editTransition(id: string) {
    this.inspectedTransition = id;
    this.$modal.show('transition-settings');
  }

  deleteTransition(id: string) {
    if (this.transitionsService.state.transitions.length === 1) {
      alert($t('transitions.mustHaveLeastOneTransition'));
      return;
    }

    this.transitionsService.deleteTransition(id);
  }

  makeDefault(id: string) {
    this.transitionsService.setDefaultTransition(id);
  }

  // CONNECTIONS

  get connections() {
    return this.transitionsService.state.connections;
  }

  addConnection() {
    const connection = this.transitionsService.addConnection(
      this.scenesService.scenes[0].id,
      this.scenesService.scenes[1].id,
      this.transitions[0].id,
    );
    this.editConnection(connection.id);
  }

  editConnection(id: string) {
    this.inspectedConnection = id;
    this.$modal.show('connection-settings');
  }

  deleteConnection(id: string) {
    this.transitionsService.deleteConnection(id);
  }

  getTransitionName(id: string) {
    const transition = this.transitionsService.getTransition(id);

    if (transition) return transition.name;
    return `<${$t('transitions.deleted')}>`;
  }

  getSceneName(id: string) {
    const scene = this.scenesService.getScene(id);

    if (scene) return scene.name;
    return `<${$t('transitions.deleted')}>`;
  }

  isConnectionRedundant(id: string) {
    return this.transitionsService.isConnectionRedundant(id);
  }

  nameForType(type: ETransitionType) {
    return this.transitionsService.getTypes().find(t => t.value === type).description;
  }

  done() {
    this.windowsService.closeChildWindow();
  }

  dismissModal(modal: string) {
    this.$modal.hide(modal);
  }
}
