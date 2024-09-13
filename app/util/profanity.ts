import { Service } from '../services/core/service';
import { getKeys } from './getKeys';

interface IProfanityFilterOptions {
  useDefaultRegex?: boolean;
  extraRegex?: RegExp;
  replacementsList?: string[];
  replace?: boolean;
  obscureSymbol?: string;
}

export class ProfanityFilterService extends Service {
  leetReplace = {
    a: '(a|a\\.|a\\-|4|@|Á|á|À|Â|à|Â|â|Ä|ä|Ã|ã|Å|å|α|Δ|Λ|λ)',
    b: '(b|b\\.|b\\-|8|\\|3|ß|Β|β)',
    c: '(c|c\\.|c\\-|Ç|ç|¢|€|<|\\(|{|©)',
    d: '(d|d\\.|d\\-|&part,|\\|\\)|Þ|þ|Ð|ð)',
    e: '(e|e\\.|e\\-|3|€|È|è|É|é|Ê|ê|∑)',
    f: '(f|f\\.|f\\-|ƒ)',
    g: '(g|g\\.|g\\-|6|9)',
    h: '(h|h\\.|h\\-|Η)',
    i: '(i|i\\.|i\\-|!|\\||\\]\\[|]|1|∫|Ì|Í|Î|Ï|ì|í|î|ï)',
    j: '(j|j\\.|j\\-)',
    k: '(k|k\\.|k\\-|Κ|κ)',
    l: '(l|1\\.|l\\-|!|\\||\\]\\[|]|£|∫|Ì|Í|Î|Ï)',
    m: '(m|m\\.|m\\-)',
    n: '(n|n\\.|n\\-|η|Ν|Π)',
    o: '(o|o\\.|o\\-|0|Ο|ο|Φ|¤|°|ø)',
    p: '(p|p\\.|p\\-|ρ|Ρ|¶|þ)',
    q: '(q|q\\.|q\\-)',
    r: '(r|r\\.|r\\-|®)',
    s: '(s|s\\.|s\\-|5|\\$|§)',
    t: '(t|t\\.|t\\-|Τ|τ)',
    u: '(u|u\\.|u\\-|υ|µ)',
    v: '(v|v\\.|v\\-|υ|ν)',
    w: '(w|w\\.|w\\-|ω|ψ|Ψ)',
    x: '(x|x\\.|x\\-|Χ|χ)',
    y: '(y|y\\.|y\\-|¥|γ|ÿ|ý|Ÿ|Ý)',
    z: '(z|z\\.|z\\-|Ζ)',
  };

  badWords = [
    /(\s|^)anal/,
    /(\s|^)anus/,
    /(\s|^)ass/,
    /ass+ho+le/,
    /ballsack/,
    /b+i+t*c+h+/,
    /boo+b/,
    /ballsack/,
    /blow\s*job/,
    /blow\s*me/,
    /c+u+n+t+/,
    /(\s|^)c+o+c+k/,
    /c+h+i+n+k+/,
    /clit/,
    /(\s|^)cum/,
    /d+o+u+c+h+e+/,
    /d+i+c+k+/,
    /d+y+k+e+/,
    /dildo/,
    /ejaculat/,
    /f+a+g+/,
    /f+u*c+k+\S*/,
    /fu+k/,
    /g+oo+k+/,
    /g+oo+c+h+/,
    /ga+ywa+d+/,
    /ga+ylo+rd+/,
    /gaa+y/,
    /gangbang/,
    /horny/,
    /jack\s*off/,
    /jack\s*ass/,
    /(\s|^)jap+(\s|$)/,
    /jerk\s*off/,
    /jizz+/,
    /lesbo+/,
    /masterbai?t/,
    /(\s|^)niga/,
    /(\s|^)nigg/,
    /nut\s*sack/,
    /penis/,
    /(\s|^)pri+cks*(\s|$)/,
    /pu+ss+y+/,
    /(\s|^)porn/,
    /(\s|^)piss/,
    /(\s|^)prick/,
    /quee+r+/,
    /r+e+t+a+r+d+/,
    /rim\s*job/,
    /s+l+u+t+/,
    /s+k+a+n+k+/,
    /twat/,
    /vagina/,
    /(\s|^)wank/,
    /whore/,
  ];

  DEFAULT_REPLACEMENTS = [
    'bunnies',
    'butterfly',
    'kitten',
    'love',
    'gingerly',
    'flowers',
    'puppy',
    'joyful',
    'rainbows',
    'unicorn',
  ];

  DEFAULT_REGEX = /(?:)/;

  init() {
    const badWordsStringsArray: string[] = [];
    this.badWords.forEach(badWord => {
      badWordsStringsArray.push(badWord.source);
    });
    let badWordsStrings = badWordsStringsArray.join('|');

    getKeys(this.leetReplace).forEach(letter => {
      badWordsStrings = badWordsStrings.replace(
        new RegExp(/([^\\])/.source + letter, 'gi'),
        '$1' + this.leetReplace[letter],
      );
    });

    this.DEFAULT_REGEX = new RegExp(badWordsStrings, 'gi');
  }

  getListRegex(list: string[]) {
    const mapList = list.map(item => {
      return item.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    });
    return new RegExp('(' + mapList.join('|') + ')', 'gi');
  }

  testString(str = '', options = {}) {
    const mergedOptions: IProfanityFilterOptions = Object.assign(
      {
        useDefaultRegex: true,
        extraRegex: null,
      },
      options,
    );

    if (mergedOptions.useDefaultRegex) {
      if (this.DEFAULT_REGEX.test(str)) {
        return true;
      }
    }

    if (mergedOptions.extraRegex) {
      if (mergedOptions.extraRegex.test(str)) {
        return true;
      }
    }

    return false;
  }

  purifyString(str = '', options = {}) {
    const mergedOptions: IProfanityFilterOptions = Object.assign(
      {
        replacementsList: this.DEFAULT_REPLACEMENTS,
        extraRegex: null,
        useDefaultRegex: true,
        replace: false,
        obscureSymbol: '*',
      },
      options,
    );

    const matches: any[] = [];
    let purified = str;

    if (mergedOptions.extraRegex) {
      purified = purified.replace(mergedOptions.extraRegex, val => {
        matches.push(val);
        if (mergedOptions.replace) {
          return mergedOptions.replacementsList[
            Math.floor(Math.random() * mergedOptions.replacementsList.length)
          ];
        }

        let obscured = '';
        val.split('').forEach(letter => {
          obscured += mergedOptions.obscureSymbol;
        });
        return obscured;
      });
    }

    if (mergedOptions.useDefaultRegex) {
      purified = purified.replace(this.DEFAULT_REGEX, val => {
        matches.push(val);
        if (mergedOptions.replace) {
          return mergedOptions.replacementsList[
            Math.floor(Math.random() * mergedOptions.replacementsList.length)
          ];
        }

        let obscured = '';
        val.split('').forEach(letter => {
          obscured += mergedOptions.obscureSymbol;
        });
        return obscured;
      });
    }

    return [purified, matches];
  }

  processString(str = '', options = {}): [string, boolean] {
    const mergedOptions = Object.assign(
      {
        replacementsList: this.DEFAULT_REPLACEMENTS,
        extraRegex: null,
        useDefaultRegex: true,
        replace: false,
        isName: false,
        obscureSymbol: '*',
      },
      options,
    );

    // split the string into the words
    const words = str.split(' ');
    let wordsNew = words;
    const badWordsPos: any[] = [];

    words.forEach((word, i) => {
      // clean the word from all special characters
      let wordCleaned = word.replace(/[&\/\\#\-,=+()$~%.'":*?<>{}_]/g, '');
      wordCleaned = wordCleaned.toLowerCase();

      // check for default words
      if (mergedOptions.useDefaultRegex) {
        this.DEFAULT_REGEX.lastIndex = 0; // cuz we have /g, we need to reset index in the loop
        if (this.DEFAULT_REGEX.test(wordCleaned)) {
          // mark the word as a bad word
          badWordsPos.push(i);
        }
      }

      // check for extra words
      if (mergedOptions.extraRegex) {
        mergedOptions.extraRegex.lastIndex = 0; // cuz we have /g, we need to reset index in the loop
        if (mergedOptions.extraRegex.test(wordCleaned)) {
          // mark the word as a bad word
          badWordsPos.push(i);
        }
      }
    });

    const hasBadwords = badWordsPos.length > 0;
    if (hasBadwords) {
      if (mergedOptions.isName) {
        wordsNew = ['Anonymous'];
      } else {
        // process bad words
        badWordsPos.forEach(position => {
          const badWordPos = position;
          const badWord = words[badWordPos];
          let badWordNew = badWord;

          if (mergedOptions.replace) {
            badWordNew =
              mergedOptions.replacementsList[
                Math.floor(Math.random() * mergedOptions.replacementsList.length)
              ];
          } else {
            badWordNew = badWord.replace(/./g, mergedOptions.obscureSymbol);
          }

          wordsNew[badWordPos] = badWordNew;
        });
      }
    }

    const strNew = wordsNew.join(' ');

    return [strNew, hasBadwords];
  }
}
