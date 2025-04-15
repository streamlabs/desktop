import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation, ViewHandler } from './core/stateful-service';
import Vue from 'vue';
import { Inject } from 'services/core';
import { AppService } from 'services/app';

export enum EDismissable {
  SceneCollectionsHelpTip = 'scene_collections_help_tip',
  RecentEventsHelpTip = 'recent_events_help_tip',
  FacebookNeedPermissionsTip = 'facebook_need_permissions_tip',
  HighlighterNotification = 'highlighter_notification',
  GuestCamFirstTimeModal = 'guest_cam_first_time',
  SourceSelectorFolders = 'source_selector_folders',
  CollabCamRollout = 'collab_cam_rollout',
  NewSideNav = 'new_side_nav',
  CustomMenuSettings = 'custom_menu_settings',
  LoginPrompt = 'login_prompt',
  TikTokRejected = 'tiktok_rejected',
  TikTokEligible = 'tiktok_eligible',
  EnhancedBroadcasting = 'enhanced_broadcasting',
}

interface IDismissablesServiceState {
  [key: string]: boolean;
}

class DismissablesViews extends ViewHandler<IDismissablesServiceState> {
  shouldShow(key: EDismissable) {
    return !this.state[key];
  }
}

/**
 * A dismissable is anything that can be dismissed and should
 * never show up again, like a help tip.
 */
export class DismissablesService extends PersistentStatefulService<IDismissablesServiceState> {
  @Inject() appService: AppService;

  initialize() {
    Object.values(EDismissable).forEach(key => {
      // Some keys have extra show criteria
      if (key === EDismissable.RecentEventsHelpTip && !this.state[key]) {
        // If this is a fresh cache, never show the tip
        if (this.appService.state.onboarded) {
          this.dismiss(key);
        }
      }
    });
  }

  get views() {
    return new DismissablesViews(this.state);
  }

  dismiss(key: EDismissable) {
    this.DISMISS(key);
  }

  dismissAll() {
    Object.keys(EDismissable).forEach((key: keyof typeof EDismissable) =>
      this.dismiss(EDismissable[key]),
    );
  }

  /**
   * Resets all dismissables. Useful for testing.
   * @deprecated For testing use only
   */
  reset() {
    this.RESET();
  }

  @mutation()
  DISMISS(key: EDismissable) {
    Vue.set(this.state, key, true);
  }

  @mutation()
  RESET() {
    this.state = {};
  }
}
