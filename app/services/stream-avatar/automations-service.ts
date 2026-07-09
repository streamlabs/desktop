import { InitAfter } from 'services/core';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { Inject } from 'services/core/injector';
import { AgentSocketService } from './agent-socket-service';
import { UserService } from 'services/user';
import { WindowsService } from 'services/windows';
import { $t } from 'services/i18n';
import Utils from 'services/utils';
import type { TAutomationExport } from './engine/automations';

interface IAutomationsState {
  automations: TAutomationExport[];
  loading: boolean;
  loaded: boolean;
  error: boolean;
}

const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 30000;

@InitAfter('UserService')
export class AutomationsService extends StatefulService<IAutomationsState> {
  static initialState: IAutomationsState = {
    automations: [],
    loading: false,
    loaded: false,
    error: false,
  };

  @Inject() private agentSocketService: AgentSocketService;
  @Inject() private userService: UserService;
  @Inject() private windowsService: WindowsService;

  private retryDelay = RETRY_BASE_DELAY_MS;
  private retryTimer: number | null = null;

  init() {
    console.log('[AutomationsService] init() called. isWorkerWindow:', Utils.isWorkerWindow());
    if (!Utils.isWorkerWindow()) return;
    console.log('[AutomationsService] init() isLoggedIn:', this.userService.isLoggedIn);
    if (this.userService.isLoggedIn) {
      this.fetchAll();
    }
    this.userService.userLogin.subscribe(() => {
      console.log('[AutomationsService] userLogin fired, fetching');
      this.fetchAll();
    });
    this.userService.userLogout.subscribe(() => {
      console.log('[AutomationsService] userLogout fired, resetting');
      if (this.retryTimer !== null) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.retryDelay = RETRY_BASE_DELAY_MS;
      this.RESET();
    });
  }

  showAutomations() {
    this.windowsService.showWindow({
      componentName: 'EditAutomations',
      title: $t('Automations'),
      size: {
        width: 900,
        height: 625,
      },
    });
  }

  showAutomationEditor(id: number) {
    this.windowsService.showWindow({
      componentName: 'EditAutomations',
      title: $t('Automations'),
      size: {
        width: 900,
        height: 625,
      },
      queryParams: { editAutomationId: id },
    });
  }

  showCreateAutomation() {
    this.windowsService.showWindow({
      componentName: 'EditAutomations',
      title: $t('Automations'),
      size: {
        width: 900,
        height: 625,
      },
      queryParams: { createNew: true },
    });
  }

  @mutation()
  private SET_AUTOMATIONS(automations: TAutomationExport[]) {
    this.state.automations = automations;
    this.state.loaded = true;
    this.state.loading = false;
    this.state.error = false;
  }

  @mutation()
  private SET_LOADING(loading: boolean) {
    this.state.loading = loading;
  }

  @mutation()
  private SET_ERROR(error: boolean) {
    this.state.error = error;
  }

  @mutation()
  private ADD_AUTOMATION(automation: TAutomationExport) {
    this.state.automations = [automation, ...this.state.automations];
  }

  @mutation()
  private UPDATE_AUTOMATION(automation: TAutomationExport) {
    this.state.automations = this.state.automations.map(a =>
      a.id === automation.id ? automation : a,
    );
  }

  @mutation()
  private REMOVE_AUTOMATION(id: number) {
    this.state.automations = this.state.automations.filter(a => a.id !== id);
  }

  @mutation()
  private RESET() {
    this.state.automations = [];
    this.state.loading = false;
    this.state.loaded = false;
    this.state.error = false;
  }

  async fetchAll(): Promise<void> {
    console.log('[AutomationsService] fetchAll() start');
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.SET_LOADING(true);
    try {
      const automations = await this.agentSocketService.getAutomations();
      console.log('[AutomationsService] fetchAll() got', automations?.length, 'automations');
      this.SET_AUTOMATIONS(automations as TAutomationExport[]);
      this.retryDelay = RETRY_BASE_DELAY_MS;
    } catch (e: unknown) {
      this.SET_LOADING(false);
      this.SET_ERROR(true);
      console.error('[AutomationsService] fetchAll failed', e);
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (this.userService.isLoggedIn) this.fetchAll();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_DELAY_MS);
  }

  async create(automation: Omit<TAutomationExport, 'id'>): Promise<TAutomationExport> {
    const created = await this.agentSocketService.createAutomation(automation);
    this.ADD_AUTOMATION(created as TAutomationExport);
    return created as TAutomationExport;
  }

  async update(id: number, automation: Partial<TAutomationExport>): Promise<TAutomationExport> {
    // Explicitly build the payload — avoid spreading the full runtime object which
    // includes server-managed fields (user_id, created_at, updated_at) returned by
    // getAutomations but not accepted for writes.
    const payload = {
      id,
      description: automation.description,
      conditions: automation.conditions,
      actions: automation.actions,
      enabled: automation.enabled,
    };
    const updated = await this.agentSocketService.updateAutomation(payload);
    this.UPDATE_AUTOMATION(updated as TAutomationExport);
    return updated as TAutomationExport;
  }

  async remove(id: number): Promise<void> {
    await this.agentSocketService.deleteAutomation(id);
    this.REMOVE_AUTOMATION(id);
  }
}
