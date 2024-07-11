/* tslint:disable:max-line-length quotemark */

import { apply, splitByRegExpWithMatchedValues } from './autoLink';

test('全部入り', () => {
  expect(
    apply(
      `
わいわい<br />
lv1 co1 sm9<br />
<b>これはbタグで sm9 を含む</b><br />
https://live.nicovideo.jp<br />
https://live.nicovideo.jp/<br />
https://live.nicovideo.jp/my<br />
<i>user/1</i>
`,
    ),
  ).toMatchInlineSnapshot(`
    "
    わいわい<br />
    <a href="https://live.nicovideo.jp/watch/lv1">lv1</a> <a href="https://com.nicovideo.jp/community/co1">co1</a> <a href="https://www.nicovideo.jp/watch/sm9">sm9</a><br />
    <b>これはbタグで <a href="https://www.nicovideo.jp/watch/sm9">sm9</a> を含む</b><br />
    <a href="https://live.nicovideo.jp">https://live.nicovideo.jp</a><br />
    <a href="https://live.nicovideo.jp/">https://live.nicovideo.jp/</a><br />
    <a href="https://live.nicovideo.jp/my">https://live.nicovideo.jp/my</a><br />
    <i><a href="https://www.nicovideo.jp/user/1">user/1</a></i>
    "
  `);
});

test('sm9', () => {
  expect(apply('sm9')).toMatchInlineSnapshot(
    `"<a href="https://www.nicovideo.jp/watch/sm9">sm9</a>"`,
  );
});

test('watch/1234567890', () => {
  expect(apply('watch/1234567890')).toMatchInlineSnapshot(
    `"<a href="https://www.nicovideo.jp/watch/1234567890">watch/1234567890</a>"`,
  );
});

test('user/1', () => {
  expect(apply('user/1')).toMatchInlineSnapshot(
    `"<a href="https://www.nicovideo.jp/user/1">user/1</a>"`,
  );
});

test('myvideo/1', () => {
  expect(apply('myvideo/1')).toMatchInlineSnapshot(
    `"<a href="https://www.nicovideo.jp/myvideo/1">myvideo/1</a>"`,
  );
});

test('series/1', () => {
  expect(apply('series/1')).toMatchInlineSnapshot(
    `"<a href="https://www.nicovideo.jp/series/1">series/1</a>"`,
  );
});

test('lv1', () => {
  expect(apply('lv1')).toMatchInlineSnapshot(
    `"<a href="https://live.nicovideo.jp/watch/lv1">lv1</a>"`,
  );
});

test('co1', () => {
  expect(apply('co1')).toMatchInlineSnapshot(
    `"<a href="https://com.nicovideo.jp/community/co1">co1</a>"`,
  );
});

test('mylist/1', () => {
  expect(apply('mylist/1')).toMatchInlineSnapshot(
    `"<a href="https://www.nicovideo.jp/mylist/1">mylist/1</a>"`,
  );
});

test('niconicommons.jp/user/1', () => {
  expect(apply('niconicommons.jp/user/1')).toMatchInlineSnapshot(
    `"<a href="https://www.niconicommons.jp/user/1">niconicommons.jp/user/1</a>"`,
  );
});

test('nc1', () => {
  expect(apply('nc1')).toMatchInlineSnapshot(
    `"<a href="https://www.niconicommons.jp/material/nc1">nc1</a>"`,
  );
});

test('ch1', () => {
  expect(apply('ch1')).toMatchInlineSnapshot(
    `"<a href="https://ch.nicovideo.jp/channel/ch1">ch1</a>"`,
  );
});

test('ch.nicovideo.jp/hoge', () => {
  expect(apply('ch.nicovideo.jp/hoge')).toMatchInlineSnapshot(
    `"<a href="https://ch.nicovideo.jp/hoge">ch.nicovideo.jp/hoge</a>"`,
  );
});

test('ar2525', () => {
  expect(apply('ar2525')).toMatchInlineSnapshot(
    `"<a href="https://ch.nicovideo.jp/article/ar2525">ar2525</a>"`,
  );
});

test('nw1', () => {
  expect(apply('nw1')).toMatchInlineSnapshot(
    `"<a href="https://news.nicovideo.jp/watch/nw1">nw1</a>"`,
  );
});

test('dw1', () => {
  expect(apply('dw1')).toMatchInlineSnapshot(
    `"<a href="https://ichiba.nicovideo.jp/item/dw1">dw1</a>"`,
  );
});

test('azABXZ120945', () => {
  expect(apply('azABXZ120945')).toMatchInlineSnapshot(
    `"<a href="https://ichiba.nicovideo.jp/item/azABXZ120945">azABXZ120945</a>"`,
  );
});

test('ap2525', () => {
  expect(apply('ap2525')).toMatchInlineSnapshot(
    `"<a href="https://app.nicovideo.jp/app/ap2525">ap2525</a>"`,
  );
});

test('im1', () => {
  expect(apply('im1')).toMatchInlineSnapshot(
    `"<a href="https://seiga.nicovideo.jp/seiga/im1">im1</a>"`,
  );
});

test('clip/1', () => {
  expect(apply('clip/1')).toMatchInlineSnapshot(
    `"<a href="https://seiga.nicovideo.jp/clip/1">clip/1</a>"`,
  );
});

test('user/illust/1', () => {
  expect(apply('user/illust/1')).toMatchInlineSnapshot(
    `"<a href="https://seiga.nicovideo.jp/user/illust/1">user/illust/1</a>"`,
  );
});

test('mg1', () => {
  expect(apply('mg1')).toMatchInlineSnapshot(
    `"<a href="https://seiga.nicovideo.jp/watch/mg1">mg1</a>"`,
  );
});

test('bk1', () => {
  expect(apply('bk1')).toMatchInlineSnapshot(
    `"<a href="https://seiga.nicovideo.jp/watch/bk1">bk1</a>"`,
  );
});

test('sg1', () => {
  expect(apply('sg1')).toMatchInlineSnapshot(
    `"<a href="https://seiga.nicovideo.jp/watch/sg1">sg1</a>"`,
  );
});

test('comic/1', () => {
  expect(apply('comic/1')).toMatchInlineSnapshot(
    `"<a href="https://seiga.nicovideo.jp/comic/1">comic/1</a>"`,
  );
});

test('td1', () => {
  expect(apply('td1')).toMatchInlineSnapshot(
    `"<a href="https://3d.nicovideo.jp/works/td1">td1</a>"`,
  );
});

test('jps1', () => {
  expect(apply('jps1')).toMatchInlineSnapshot(
    `"<a href="https://jpstore.dwango.jp/products/detail.php?product_id=1">jps1</a>"`,
  );
});

test('kn1', () => {
  expect(apply('kn1')).toMatchInlineSnapshot(
    `"<a href="https://niconare.nicovideo.jp/watch/kn1">kn1</a>"`,
  );
});

test('gm1', () => {
  expect(apply('gm1')).toMatchInlineSnapshot(
    `"<a href="https://game.nicovideo.jp/atsumaru/games/gm1">gm1</a>"`,
  );
});

test('mt1', () => {
  expect(apply('mt1')).toMatchInlineSnapshot(
    `"<a href="https://mtm.nicovideo.jp/watch/mt1">mt1</a>"`,
  );
});

test('nq1', () => {
  expect(apply('nq1')).toMatchInlineSnapshot(
    `"<a href="https://q.nicovideo.jp/watch/nq1">nq1</a>"`,
  );
});

test('https://www.nicovideo.jp/my', () => {
  expect(apply('https://www.nicovideo.jp/my')).toMatchInlineSnapshot(
    `"<a href="https://www.nicovideo.jp/my">https://www.nicovideo.jp/my</a>"`,
  );
});

test('https://example.com/', () => {
  expect(apply('https://example.com/')).toMatchInlineSnapshot(
    `"<a href="https://example.com/">https://example.com/</a>"`,
  );
});

test('https://example.com', () => {
  expect(apply('https://example.com')).toMatchInlineSnapshot(
    `"<a href="https://example.com">https://example.com</a>"`,
  );
});

test('日本語ドメイン', () => {
  expect(apply('https://日本語.jp')).toMatchInlineSnapshot(
    `"<a href="https://日本語.jp">https://日本語.jp</a>"`,
  );
  expect(apply('https://はじめよう.みんな')).toMatchInlineSnapshot(
    `"<a href="https://はじめよう.みんな">https://はじめよう.みんな</a>"`,
  );
});

test('punycode', () => {
  expect(apply('https://xn--wgv71a119e.jp')).toMatchInlineSnapshot(
    `"<a href="https://xn--wgv71a119e.jp">https://xn--wgv71a119e.jp</a>"`,
  );
  expect(apply('https://xn--p8j9a0d9c9a.xn--q9jyb4c/index.html')).toMatchInlineSnapshot(
    `"<a href="https://xn--p8j9a0d9c9a.xn--q9jyb4c/index.html">https://xn--p8j9a0d9c9a.xn--q9jyb4c/index.html</a>"`,
  );
});

test('タグの属性は自動リンクしない', () => {
  expect(apply('<font color="sm9">不正なcolor指定を含むfontタグ</font>')).toMatchInlineSnapshot(
    `"<font color="sm9">不正なcolor指定を含むfontタグ</font>"`,
  );
});

test('複雑なURL', () => {
  expect(
    apply(
      'a https://www.google.co.jp/maps/place/%E6%AD%8C%E8%88%9E%E4%BC%8E%E5%BA%A7%E3%82%BF%E3%83%AF%E3%83%BC/@35.6697631,139.7657757,17z/data=!3m1!4b1!4m5!3m4!1s0x60188be0cb909cf5:0x91d7308f4a922dc4!8m2!3d35.6697588!4d139.7679644 b',
    ),
  ).toMatchInlineSnapshot(
    `"a <a href="https://www.google.co.jp/maps/place/%E6%AD%8C%E8%88%9E%E4%BC%8E%E5%BA%A7%E3%82%BF%E3%83%AF%E3%83%BC/@35.6697631,139.7657757,17z/data=!3m1!4b1!4m5!3m4!1s0x60188be0cb909cf5:0x91d7308f4a922dc4!8m2!3d35.6697588!4d139.7679644">https://www.google.co.jp/maps/place/%E6%AD%8C%E8%88%9E%E4%BC%8E%E5%BA%A7%E3%82%BF%E3%83%AF%E3%83%BC/@35.6697631,139.7657757,17z/data=!3m1!4b1!4m5!3m4!1s0x60188be0cb909cf5:0x91d7308f4a922dc4!8m2!3d35.6697588!4d139.7679644</a> b"`,
  );
});

describe('splitByRegExpWithMatchedValues', () => {
  test('マッチするものがひとつだけ', () => {
    const pattern = /\bsm\d+\b/g;
    expect(splitByRegExpWithMatchedValues('sm9', pattern)).toMatchInlineSnapshot(`
      [
        "",
        "sm9",
      ]
    `);
  });

  test('マッチするものが複数', () => {
    const pattern = /\bsm\d+\b/g;
    expect(splitByRegExpWithMatchedValues('sm9 a sm175 b sm345', pattern)).toMatchInlineSnapshot(`
      [
        "",
        "sm9",
        " a ",
        "sm175",
        " b ",
        "sm345",
      ]
    `);
  });

  test('先頭にマッチしない', () => {
    const pattern = /\bsm\d+\b/g;
    const result = splitByRegExpWithMatchedValues('header sm9', pattern);
    result.forEach((str, idx) => {
      if (idx % 2) {
        expect(str).toMatch(pattern);
      } else {
        expect(str).not.toMatch(pattern);
      }
    });
    expect(result).toMatchInlineSnapshot(`
      [
        "header ",
        "sm9",
      ]
    `);
  });

  test('末尾にマッチしない', () => {
    const pattern = /\bsm\d+\b/g;
    const result = splitByRegExpWithMatchedValues('sm9 trailer', pattern);
    result.forEach((str, idx) => {
      if (idx % 2) {
        expect(str).toMatch(pattern);
      } else {
        expect(str).not.toMatch(pattern);
      }
    });
    expect(result).toMatchInlineSnapshot(`
      [
        "",
        "sm9",
        " trailer",
      ]
    `);
  });

  test('マッチしない文字列', () => {
    const pattern = /\bsm\d+\b/g;
    const result = splitByRegExpWithMatchedValues('header hoge trailer', pattern);
    result.forEach((str, idx) => {
      if (idx % 2) {
        expect(str).toMatch(pattern);
      } else {
        expect(str).not.toMatch(pattern);
      }
    });
    expect(result).toMatchInlineSnapshot(`
      [
        "header hoge trailer",
      ]
    `);
  });

  test('空文字列', () => {
    const pattern = /\bsm\d+\b/g;
    const result = splitByRegExpWithMatchedValues('', pattern);
    result.forEach((str, idx) => {
      if (idx % 2) {
        expect(str).toMatch(pattern);
      } else {
        expect(str).not.toMatch(pattern);
      }
    });
    expect(result).toMatchInlineSnapshot(`[]`);
  });

  test('空文字列にマッチするパターンを含んでも動作する', () => {
    const pattern = /(?:)/g;
    const result = splitByRegExpWithMatchedValues('a bc de f', pattern);
    expect(result).toMatchInlineSnapshot(`
      [
        "",
        "",
        "a",
        "",
        " ",
        "",
        "b",
        "",
        "c",
        "",
        " ",
        "",
        "d",
        "",
        "e",
        "",
        " ",
        "",
        "f",
        "",
      ]
    `);
  });
});
