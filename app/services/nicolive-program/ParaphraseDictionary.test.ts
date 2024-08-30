import {
  filterEngineId,
  isText,
  ParaphraseDictionary,
  replace_rules,
  replace_text,
} from './ParaphraseDictionary';

describe('filterEngineId', () => {
  it('should return true if onlyFor is undefined', () => {
    const item: replace_text = {
      replacement: 'replacement',
      text: 'text',
    };
    expect(filterEngineId(item, 'webSpeech')).toBe(true);
  });

  it('should return true if onlyFor is equal to engine', () => {
    const item: replace_text = {
      replacement: 'replacement',
      text: 'text',
      onlyFor: 'webSpeech',
    };
    expect(filterEngineId(item, 'webSpeech')).toBe(true);
  });

  it('should return false if onlyFor is not equal to engine', () => {
    const item: replace_text = {
      replacement: 'replacement',
      text: 'text',
      onlyFor: 'nVoice',
    };
    expect(filterEngineId(item, 'webSpeech')).toBe(false);
  });
});

describe('ParaphraseDictionary', () => {
  const dictionary = new ParaphraseDictionary();
  const synthId = 'webSpeech';
  test('remove URL', () =>
    expect(dictionary.process('https://www.nicovideo.jp', synthId)).toBe('URLショウリャク'));

  expect(dictionary.process('8888', synthId)).toBe('パチパチパチ');
  expect(dictionary.process('ww', synthId)).toBe('ワラワラ');
  expect(dictionary.process('テストw', synthId)).toBe('テスト、ワラ');

  test('末尾の（生放送クルーズさんの番組）を除去', () => {
    expect(dictionary.process('A（生放送クルーズさんの番組）', synthId)).toBe('A');
    expect(dictionary.process('A（生放送クルーズさんの番組）B', synthId)).toBe(
      'A（生放送クルーズさんの番組）B',
    );
    expect(dictionary.process('（生放送クルーズさんの番組）B', synthId)).toBe(
      '（生放送クルーズさんの番組）B',
    );
  });

  test('remove multiple lines comments', () => {
    expect(dictionary.process('複数行は\nすべて無視', synthId)).toBe('');
    expect(dictionary.process('今\n北\n産\n業', synthId)).toBe('');
  });

  // 他の設定に影響を受けていないかどうか、全部試してみる
  const table = replace_rules.elements
    .filter(isText)
    .map<[string, string]>((elem: replace_text) => [elem.text, elem.replacement]);
  test.each(table)('text %s -> %s', (text, replace) =>
    expect(dictionary.process(text, synthId)).toBe(replace),
  );

  test('match multiple times', () => {
    const [text, replace] = table[0];
    expect(dictionary.process(`${text}${text}`, synthId)).toBe(`${replace}${replace}`);
  });
});
