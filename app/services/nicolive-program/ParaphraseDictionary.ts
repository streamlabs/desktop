type EngineId = 'webSpeech' | 'nVoice';

export type replace_common_field = {
  note?: string;
  replacement: string;
  onlyFor?: EngineId;
};
export type replace_regular_expression = replace_common_field & {
  regularExpression: string;
};
export type replace_text = replace_common_field & {
  text: string;
};
export type replace_item = replace_regular_expression | replace_text;

export type replace_rules_type = { elements: replace_item[] };

export const replace_rules = require('./replace_rules.json') as replace_rules_type;

export function isText(r: replace_item): r is replace_text {
  return (r as unknown as replace_text).text !== undefined;
}

function escapeStringRegexp(string: string): string {
  return string.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
}

export function filterEngineId(item: { onlyFor?: EngineId }, engineId: EngineId): boolean {
  return !item.onlyFor || item.onlyFor === engineId;
}

export class ParaphraseDictionary {
  dictionary = replace_rules.elements.map(e => ({
    pattern: new RegExp(isText(e) ? escapeStringRegexp(e.text) : e.regularExpression, 'gi'),
    to: e.replacement,
    onlyFor: e.onlyFor,
  }));

  process(input: string, engine: EngineId): string {
    return this.dictionary
      .filter(item => filterEngineId(item, engine))
      .reduce<string>((acc, item) => acc.replace(item.pattern, item.to), input);
  }
}
