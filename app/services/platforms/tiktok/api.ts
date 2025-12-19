import { TPlatform } from '..';

export type TTikTokScope =
  | 'live.room.info'
  | 'live.room.manage'
  | 'research.adlib.basic'
  | 'research.data.basic'
  | 'user.info.basic'
  | 'user.info.profile'
  | 'user.info.stats'
  | 'video.list'
  | 'video.publish'
  | 'video.upload';

export enum ETikTokLiveRoomDestinations {
  OBS = 1,
  STREAMLABS = 2,
}

export enum ETikTokLiveScopeReason {
  RELOG = -1,
  NOT_APPROVED = 0, // also includes users that have been denied
  APPROVED = 1,
  APPROVED_OBS = 2,
}

export enum ETikTokAudienceType {
  ALL = 0,
  MATURE = 1,
}

export type TTikTokLiveScopeTypes = 'approved' | 'denied' | 'legacy' | 'relog' | 'never-applied';
export type TTikTokApplicationStatus = 'approved' | 'rejected' | 'never_applied';

export interface ITikTokLiveScopeResponse {
  platform: TPlatform | string;
  reason: ETikTokLiveScopeReason;
  can_be_live?: boolean;
  user?: ITikTokUserData;
  info?: any[] | null[] | undefined[] | ITikTokGame[] | ITikTokGamesData | any;
  audience_controls_info: ITikTokAudienceControlsInfo;
  application_status?: ITikTokApplicationStatus;
}

export interface ITikTokGamesData extends ITikTokLiveScopeResponse {
  categories: ITikTokGame[];
  platform: TPlatform | string;
  reason: ETikTokLiveScopeReason;
  can_be_live?: boolean;
  user?: ITikTokUserData;
  info?: any[] | null[] | undefined[] | ITikTokGame[] | ITikTokGamesData | any;
}

interface ITikTokGame {
  full_name: string;
  game_mask_id: string;
}

export interface ITikTokAudienceControlsInfo {
  disable: boolean;
  info_type: ETikTokAudienceType;
  types: ITikTokAudienceControlType[];
}

export interface ITikTokAudienceControlType {
  key: ETikTokAudienceType;
  label: string | null;
}

export interface ITikTokApplicationStatus {
  status: string;
  timestamp: string | null;
}

export interface ITikTokUserData {
  open_id?: string;
  union_id?: string;
  username: string;
  avatar_url?: string;
  is_verified?: false;
  likes_count?: number;
  video_count?: number;
  display_name?: string;
  follower_count?: number;
  following_count?: number;
  profile_deep_link?: string;
}

export interface ITikTokError {
  status?: number;
  error?: boolean;
  success?: boolean;
  message?: string;
  data?: {
    message: string;
    code: ETikTokErrorTypes;
  };
}

export enum ETikTokErrorTypes {
  ACCESS_TOKEN_INVALID = 'access_token_invalid',
  INTERNAL_ERROR = 'internal_error',
  INVALID_FILE_UPLOAD = 'invalid_file_upload',
  INVALID_PARAMS = 'invalid_params',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SCOPE_NOT_AUTHORIZED = 'scope_not_authorized',
  SCOPE_PERMISSION_MISSED = 'scope_permission_missed',
  USER_HAS_NO_LIVE_AUTH = 'user_has_no_live_auth',
  TIKTOK_ALREADY_LIVE = 'user_already_live',
  OK = 'ok',
}

export interface ITikTokStartStreamResponse {
  id: string;
  rtmp: string;
  key: string;
  chat_url?: string | null;
  broadcast_id?: string | null;
  channel_name?: string | null;
  platform_id?: string | null;
  region?: string | null;
  chat_id?: string | null;
}

export interface ITikTokEndStreamResponse {
  success: boolean;
}
