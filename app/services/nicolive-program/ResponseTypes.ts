export interface CommonErrorResponse {
  meta: {
    status: number;
    errorCode?: string;
    errorMessage?: string;
  };
  data?: { message: string };
}

export interface ProgramSchedules {
  meta: {
    status: 200;
    errorCode: 'OK';
  };
  data: {
    /** 番組ID */
    nicoliveProgramId: string;
    /** テスト開始時刻 */
    testBeginAt: number;
    /** 放送開始時刻 */
    onAirBeginAt: number;
    /** 放送終了予定時刻 */
    onAirEndAt: number;
    /** 配信コミュニティ・チャンネルID */
    socialGroupId: string;
    /** 配信状態 */
    status: 'reserved' | 'test' | 'onAir' | 'end';
  }[];
}

export interface ProgramInfo {
  meta: {
    status: 200;
    errorCode: 'OK';
  };
  data: {
    /** 番組の状態 */
    status: 'test' | 'onAir' | 'end' | 'reserved';
    /** 番組の配信者に関係する情報 */
    socialGroup:
      | {
          providerType: 'community';
          /** コミュニティ名 */
          name: string;
          /** コミュニティID */
          id: string;
          /** コミュレベル */
          communityLevel: number;
          /** サムネイルのURL */
          thumbnailUrl: string;
        }
      | {
          providerType: 'channel';
          /** チャンネル名 */
          name: string;
          /** チャンネルID */
          id: string;
          /** 配信会社名 */
          ownerName: string;
          /** サムネイルのURL */
          thumbnailUrl: string;
        };
    /** コメントのルーム */
    rooms: {
      /** コメントサーバーの接続先(Ndgr) View URL */
      viewUri: string;
    }[];
    /** 番組タイトル */
    title: string;
    /** 番組情報 */
    description: string;
    /** メンバー限定放送であるか */
    isMemberOnly: boolean;
    /** vpos基準時刻 */
    vposBaseAt: number;
    /** 開演時間 */
    beginAt: number;
    /** 終了時間 */
    endAt: number;
    /** 番組のカテゴリ・追加カテゴリ一覧 */
    categories: string[];
    /** ニコニ広告許可設定 */
    isAdsEnabled: boolean;
    /** 配信者情報 */
    broadcaster: {
      /** 配信者/チャンネルのID */
      id: number;
      /** 配信者/配信会社名 */
      name: string;
    }[];
    /** ストリーム設定 */
    streamSetting: {
      /** 配信最高画質 */
      maxQuality: '6Mbps720p' | '2Mbps450p' | '1Mbps450p' | '384kbps288p' | '192kbps288p';
      /** 配信の向き */
      orientation: 'Landscape' | 'Portrait';
    };
    moderatorViewUri: string;
  };
}

export interface Segment {
  meta: {
    status: 200;
    errorCode: 'OK';
  };
  data: {
    end_time: number;
    start_time: number;
  };
}

export interface Extension {
  meta: {
    status: 200;
    errorCode: 'OK';
  };
  data: {
    end_time: number;
  };
}

export interface OperatorComment {
  meta: {
    status: 200;
    errorCode: 'OK';
  };
}

export interface Statistics {
  meta: {
    status: 200;
    errorCode: 'OK';
  };
  data: {
    watchCount: number;
    commentCount: number;
  };
}

export interface NicoadStatistics {
  meta: {
    status: 200;
  };
  data: {
    totalAdPoint: number;
    totalGiftPoint: number;
    conductors: {
      text: string;
      url: string;
    }[];
  };
}

export type FilterRecord = {
  id: number;
  type: 'word' | 'user' | 'command';
  body: string;
  createdAt?: string; // NG登録日時: 例: "2023-02-20T00:00:00+09:00"
  memo?: string; // NG登録時のコメント本文
  isHashed?: boolean; // type: 'user' 時にユーザーIDが hash化されているかどうか
  userId?: number; // 登録者ID
  userName?: string; // 登録者名
};

export type FilterType = FilterRecord['type'];

export type AddFilterRecord = Omit<FilterRecord, 'id'> & { messageId?: string };

export interface Filters {
  meta: {
    status: 200;
  };
  data: FilterRecord[];
}

export interface AddFilterResult {
  meta: {
    status: 200;
  };
  data: {
    id: number;
  };
}

export type OnairUserProgramData = {
  programId?: string;
  nextProgramId?: string;
};

export type OnairChannelProgramData = {
  testProgramId?: string;
  programId?: string;
  nextProgramId?: string;
};

export type OnairChannelData = {
  id: string;
  name: string;
  ownerName: string;
  thumbnailUrl: string;
  smallThumbnailUrl: string;
};

export type BroadcastStreamData = {
  url: string;
  name: string;
};

export interface UserFollow {
  meta: {
    status: number;
  };
}

export interface UserFollowStatus {
  meta: {
    status: 200;
  };
  data: {
    following: boolean;
  };
}

export type Moderator = {
  userId: number;
  nickname: string;
  iconUrl: string;
  isValid: boolean;
  createdAt: string;
};

export interface AddModerator {
  meta: {
    status: 200;
  };
  data: Moderator;
}

export interface Supporters {
  meta: {
    status: 200;
  };
  data: {
    totalCount: number;
    supporterIds: string[];
  };
}
