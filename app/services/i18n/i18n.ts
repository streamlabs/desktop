import * as electron from 'electron';
import VueI18n from 'vue-i18n';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import { Inject } from 'services/core/injector';
import { FileManagerService } from 'services/file-manager';
import { AppService } from 'services/app';
import { IObsListInput, TObsFormData } from 'components/obs/inputs/ObsInput';
import { I18nServiceApi } from './i18n-api';
import * as obs from '../../../obs-api';
import * as fs from 'fs';
import * as path from 'path';
import * as remote from '@electron/remote';

interface II18nState {
  locale: string;
}

export function $t(...args: any[]): string {
  const vueI18nInstance = I18nService.vueI18nInstance;

  // some tests try to call this function before dictionaries have been loaded
  if (!vueI18nInstance) return args[0];

  return vueI18nInstance.t.call(
    I18nService.vueI18nInstance,
    ...(args as [key: string, locale: string, values?: VueI18n.Values]),
  ) as string;
}

/**
 * @see https://electronjs.org/docs/api/locales
 */
const LANG_CODE_MAP = {
  cs: { lang: 'Czech', locale: 'cs-CZ' },
  de: { lang: 'German', locale: 'de-DE' },
  'en-US': { lang: 'English', locale: 'en-US' },
  es: { lang: 'Spanish', locale: 'es-ES' },
  fr: { lang: 'French', locale: 'fr-FR' },
  it: { lang: 'Italian', locale: 'it-IT' },
  ja: { lang: 'Japanese', locale: 'ja-JP' },
  ko: { lang: 'Korean', locale: 'ko-KR' },
  pl: { lang: 'Polish', locale: 'pl-PL' },
  pt: { lang: 'Portuguese', locale: 'pt-PT' },
  'pt-BR': { lang: 'Portuguese (Brazil)', locale: 'pt-BR' },
  ru: { lang: 'Russian', locale: 'ru-RU' },
  sk: { lang: 'Slovak', locale: 'sk-SK' },
  th: { lang: 'Thai', locale: 'th-TH' },
  tr: { lang: 'Turkish', locale: 'tr-TR' },
  'zh-CN': { lang: 'Chinese (Simplified)' },
};

export class I18nService extends PersistentStatefulService<II18nState> implements I18nServiceApi {
  static defaultState: II18nState = {
    locale: 'ja-JP',
  };

  static vueI18nInstance: VueI18n;

  static setVuei18nInstance(instance: VueI18n) {
    I18nService.vueI18nInstance = instance;
  }

  private availableLocales: Dictionary<string> = {};
  private loadedDictionaries: Dictionary<Dictionary<string>> = {};
  private isLoaded = false;

  @Inject() fileManagerService: FileManagerService;
  @Inject() appService: AppService;

  async load() {
    const WHITE_LIST = ['en-US', 'ja-JP'];

    if (this.isLoaded) return;
    const i18nPath = this.getI18nPath();

    // load available locales
    const localeFiles = fs.readdirSync(i18nPath);

    for (const locale of localeFiles) {
      if (!WHITE_LIST.includes(locale)) continue;
      this.availableLocales[locale] = this.fileManagerService.read(
        `${i18nPath}/${locale}/langname.txt`,
      );
    }

    // if locale is not set than use electron's one
    let locale = this.state.locale;
    if (!locale) {
      const electronLocale = remote.app.getLocale();
      const langDescription = LANG_CODE_MAP[electronLocale];
      locale = langDescription ? langDescription.locale : 'en-US';
    }

    // load dictionary if not loaded
    if (!this.loadedDictionaries[locale]) {
      await this.loadDictionary(locale).catch(e => {
        console.error(e);
        remote.dialog.showErrorBox(
          'N Air - Error',
          `${locale}向けの辞書ファイル読み込みに失敗しました。\n` +
            `Failed to read the dictionary file for ${locale}.\n` +
            e.message,
        );
      });
    }

    // load fallback dictionary
    const fallbackLocale = this.getFallbackLocale();
    if (!this.loadedDictionaries[fallbackLocale]) {
      await this.loadDictionary(fallbackLocale).catch(e => {
        console.error(e);
        remote.dialog.showErrorBox(
          'N Air - Error',
          `${fallbackLocale}向けの辞書ファイル読み込みに失敗しました。\n` +
            `Failed to read the dictionary file for ${fallbackLocale}.\n` +
            e.message,
        );
      });
    }

    // setup locale in libobs
    obs.Global.locale = locale;

    this.SET_LOCALE(locale);

    this.isLoaded = true;
  }

  getFallbackLocale() {
    return 'en-US';
  }

  getLoadedDictionaries() {
    return this.loadedDictionaries;
  }

  setLocale(locale: string) {
    this.SET_LOCALE(locale);
    this.appService.relaunch();
  }

  setWebviewLocale(webview: Electron.WebviewTag) {
    const locale = this.state.locale;
    webview.addEventListener('dom-ready', () => {
      webview.executeJavaScript(`
        var langCode = $.cookie('langCode');
        if (langCode !== '${locale}') {
           $.cookie('langCode', '${locale}');
           window.location.reload();
        }
      `);
    });
  }

  getLocaleFormData(): TObsFormData {
    const options = Object.keys(this.availableLocales).map(locale => {
      return {
        value: locale,
        description: this.availableLocales[locale],
      };
    });

    return [
      <IObsListInput<string>>{
        type: 'OBS_PROPERTY_LIST',
        name: 'locale',
        description: $t('common.language'),
        value: this.state.locale,
        enabled: true,
        visible: true,
        options,
      },
    ];
  }

  private getI18nPath() {
    return path.join(remote.app.getAppPath(), 'app/i18n');
  }

  private async loadDictionary(locale: string): Promise<Dictionary<string>> {
    if (this.loadedDictionaries[locale]) return this.loadedDictionaries[locale];

    const i18nPath = this.getI18nPath();
    const files = await new Promise<string[]>((resolve, reject) => {
      fs.readdir(`${i18nPath}/${locale}`, (err, files) => (err ? reject(err) : resolve(files)));
    });

    const dictionaryFiles = files
      .filter(fileName => fileName.endsWith('.json'))
      .map(fileName => fileName.replace(/\.json$/, ''));

    const dictionary: Dictionary<string> = {};
    let lastReadFilePath = '';
    let rawJSON = '';
    try {
      for (const fileName of dictionaryFiles) {
        const filePath = `${i18nPath}/${locale}/${fileName}.json`;
        lastReadFilePath = filePath;
        rawJSON = this.fileManagerService.read(filePath);
        dictionary[fileName] = JSON.parse(rawJSON);
      }
    } catch (e) {
      let lineInfo = '';
      const posMatch = (e as Error).message.match(/ at position ([0-9]+)$/);
      if (posMatch.length === 2) {
        const pos = parseInt(posMatch[1], 10);
        let lineStart = 0;
        for (let line = 1; ; ++line) {
          const nextLF = rawJSON.indexOf('\n', lineStart);
          if (nextLF < 0 || nextLF > pos) {
            lineInfo = ` line ${line} column ${pos - lineStart}`;
            break;
          }
          lineStart = nextLF + 1;
        }
      }
      throw new Error(
        `in file: ${require('path').resolve(lastReadFilePath)}\n${(e as Error).message}${lineInfo}`,
      );
    }
    rawJSON = '';
    this.loadedDictionaries[locale] = dictionary;
    return dictionary;
  }

  @mutation()
  private SET_LOCALE(locale: string) {
    this.state.locale = locale;
  }
}
