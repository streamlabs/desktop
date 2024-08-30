import { IPlatformAuth } from 'services/platforms';

// 開発テスト用
export function isFakeMode(): boolean {
  return !!process.env.DEV_SERVER || !!process.env.NAIR_FAKE_PROGRAM;
}

export const FakeModeConfig = {
  dummyComment: true,
};

export const FakeUserAuth: IPlatformAuth = {
  apiToken: 'fake',
  platform: {
    type: 'niconico',
    username: 'fake',
    token: 'fake',
    id: '2',
    userIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
  },
};
