import Vue from 'vue';
import uuid from 'uuid/v4';
import { StatefulService, mutation, ViewHandler, Inject } from 'services/core';
import { HostsService } from 'services/hosts';
import { UserService } from 'services/user';
import { jfetch, authorizedHeaders } from 'util/requests';
import { GOAL_OPTIONS, GROWTH_TIPS } from './grow-data';
import { TwitchService } from 'services/platforms/twitch';
import { YoutubeService } from 'services/platforms/youtube';
import { FacebookService } from 'services/platforms/facebook';
import { TrovoService } from 'services/platforms/trovo';
import { TPlatform } from 'services/platforms';
import moment from 'moment';

export interface IGoal {
  id?: number;
  type: string;
  title: string;
  image: string;
  total: number;
  progress?: number;
  startDate?: string;
  start_date?: string;
}

export interface IUniversityProgress {
  name: string;
  avatar: string;
  finished_course_date?: string;
  total_progress: number;
  enrolled: boolean;
  stopped_at?: {
    title: string;
    description: string;
    image: string;
    url: string;
  };
}

export interface IDashboardAnalytics {
  stats: {
    follows?: string;
    subscriptions?: string;
    hosts?: string;
    bits?: string;
    raids?: string;
    viewers?: string;
    chatters?: string;
    chats?: string;
    avg_view_times?: string;
    subscribers?: string;
    sponsors?: string;
    super_chats?: string;
  };
  platforms: {
    twitch_account?: string;
    youtube_account?: string;
    facebook_account?: string;
  };
}

export interface ICommunityReach {
  icon: TPlatform;
  followers?: number;
}

interface IGrowServiceState {
  goals: Dictionary<IGoal>;
  analytics: IDashboardAnalytics;
  universityProgress: IUniversityProgress;
  communityReach: ICommunityReach[];
}

const ONE_WEEK = 6.048e8;

class GrowServiceViews extends ViewHandler<IGrowServiceState> {
  get platformOptions(): ICommunityReach[] {
    return [{ icon: 'twitch' }, { icon: 'youtube' }, { icon: 'facebook' }];
  }

  get goals() {
    return this.state.goals;
  }

  get platformsToMap() {
    return this.state.communityReach.concat(
      this.platformOptions.filter(p => !this.state.communityReach.find(r => r.icon === p.icon)),
    );
  }

  get analytics() {
    return this.state.analytics;
  }

  get universityProgress() {
    return this.state.universityProgress;
  }

  get goalOptions(): IGoal[] {
    return GOAL_OPTIONS();
  }

  get tips() {
    return GROWTH_TIPS();
  }

  goalExpiredOrComplete(goal: IGoal) {
    if (goal.progress === goal.total) return true;
    if (this.timeLeft(goal) <= 0) return true;
    return false;
  }

  timeLeft(goal: IGoal) {
    if (!goal.startDate) return Infinity;
    if (/week/.test(goal.type)) return moment(goal.startDate).valueOf() + ONE_WEEK - Date.now();
    if (/month/.test(goal.type)) {
      return moment(goal.startDate).valueOf() + ONE_WEEK * 4 - Date.now();
    }
    return Infinity;
  }
}

export class GrowService extends StatefulService<IGrowServiceState> {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() twitchService: TwitchService;
  @Inject() youtubeService: YoutubeService;
  @Inject() facebookService: FacebookService;
  @Inject() trovoService: TrovoService;

  static initialState: IGrowServiceState = {
    goals: {},
    analytics: {} as IDashboardAnalytics,
    universityProgress: {} as IUniversityProgress,
    communityReach: [] as ICommunityReach[],
  };

  @mutation()
  SET_ANALYTICS(analytics: IDashboardAnalytics) {
    this.state.analytics = analytics;
  }

  @mutation()
  SET_UNIVERSITY_PROGRESS(progress: IUniversityProgress) {
    this.state.universityProgress = progress;
  }

  @mutation()
  SET_COMMUNITY_REACH(communityReach: ICommunityReach[]) {
    this.state.communityReach = communityReach;
  }

  @mutation()
  ADD_GOAL(goal: IGoal) {
    Vue.set(this.state.goals, goal.type, goal);
  }

  @mutation()
  REMOVE_GOAL(goal: IGoal) {
    Vue.delete(this.state.goals, goal.type);
  }

  @mutation()
  SET_GOAL(goal: IGoal) {
    Vue.set(this.state.goals, goal.type, goal);
  }

  init() {
    super.init();
    this.userService.userLogin.subscribe(() => {
      this.fetchGoals();
      this.fetchAnalytics();
      this.fetchUniversityProgress();
      this.fetchPlatformFollowers();
    });
  }

  formGoalRequest(method = 'GET', body?: any) {
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/growth/goal`;
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    return new Request(url, { headers, method, body: body ? JSON.stringify(body) : undefined });
  }

  fetchGoals() {
    jfetch<IGoal[]>(this.formGoalRequest()).then(json =>
      json.forEach(goal => {
        this.ADD_GOAL({ startDate: goal.start_date, ...goal });
      }),
    );
  }

  fetchAnalytics() {
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/dashboard-analytics`;
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const request = new Request(url, { headers });
    jfetch<IDashboardAnalytics>(request).then(json => this.SET_ANALYTICS(json));
  }

  async fetchPlatformFollowers() {
    const platforms = this.userService.views.platforms;

    const platformService = {
      twitch: this.twitchService,
      facebook: this.facebookService,
      youtube: this.youtubeService,
      trovo: this.trovoService,
    };

    const communityReach: ICommunityReach[] = [];

    await Promise.all(
      Object.keys(platforms)
        .filter(platform => platform !== 'tiktok')
        .map(async platform => {
          const followers = await platformService[platform].fetchFollowers();
          communityReach.push({ icon: platform as TPlatform, followers });
        }),
    );

    this.SET_COMMUNITY_REACH(communityReach);
  }

  fetchUniversityProgress() {
    if (!this.userService.isLoggedIn) return;
    const url = `https://${this.hostsService.streamlabs}/university/api/user/info/${this.userService.widgetToken}`;
    const req = new Request(url);
    jfetch<{ user: IUniversityProgress }>(req).then(json =>
      this.SET_UNIVERSITY_PROGRESS(json.user),
    );
  }

  get views() {
    return new GrowServiceViews(this.state);
  }

  addGoal(goal: IGoal) {
    const goalWithType = {
      ...goal,
      progress: 0,
      startDate: moment().format('YYYY-MM-DD HH:mm:ss'),
      type: goal.type === 'custom' ? uuid() : goal.type,
    };

    jfetch<IGoal>(this.formGoalRequest('POST', goalWithType)).then(goalResponse => {
      this.ADD_GOAL(goalResponse);
    });
  }

  incrementGoal(goalId: string, amount: number) {
    const goal = this.state.goals[goalId];
    if (!goal || this.views.goalExpiredOrComplete(goal)) return;
    const newProgress = amount + goal.progress;

    jfetch(this.formGoalRequest('PUT', { ...goal, progress: newProgress }));
    this.SET_GOAL({ ...goal, progress: newProgress });
  }

  removeGoal(goal: IGoal) {
    jfetch(this.formGoalRequest('DELETE', { id: goal.id }));
    this.REMOVE_GOAL(goal);
  }

  clearCompletedGoals() {
    Object.values(this.state.goals).forEach(goal => {
      if (goal.progress === goal.total) {
        this.removeGoal(goal);
      }
    });
  }
}
