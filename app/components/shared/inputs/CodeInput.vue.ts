import { Component, Prop } from 'vue-property-decorator';
import { BaseInput } from './BaseInput';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/css/css.js';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/keymap/sublime';
import { IInputMetadata } from './index';
import { Inject } from 'services';
import { CustomizationService } from 'services/customization';
import CodeMirror from 'codemirror';

@Component({})
export default class CodeInput extends BaseInput<string, IInputMetadata> {
  @Prop({ default: '' })
  readonly value: string;
  @Prop()
  readonly title: string;
  @Prop({ default: () => ({ type: 'html' }) })
  readonly metadata: IInputMetadata;

  private codemirror: any;

  @Inject() customizationService: CustomizationService;

  get theme() {
    return this.customizationService.isDarkTheme ? 'material' : 'xq-light';
  }

  mounted() {
    const $textarea = this.$el.querySelector('textarea');
    const options = {
      ...this.editorOptions[this.metadata.type],
      theme: this.theme,
    };

    const codemirror = CodeMirror.fromTextArea($textarea, options);
    codemirror.setSize('100%', '100%');
    codemirror.on('changes', (cm, changeObj) => {
      this.emitInput(cm.getValue());
    });
    codemirror.setValue(this.value);
  }

  unmounted() {
    this.codemirror.getWrapperElement().remove();
  }

  // codemirror options
  editorOptions = {
    html: {
      mode: 'htmlmixed',
      keyMap: 'sublime',
      lineNumbers: true,
      autofocus: true,
      tabSize: 2,
      theme: this.theme,
      autoRefresh: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      autoCloseTags: true,
      extraKeys: {
        Tab: 'emmetExpandAbbreviation',
        Enter: 'emmetInsertLineBreak',
      },
    },

    css: {
      mode: 'text/css',
      keyMap: 'sublime',
      lineNumbers: true,
      autofocus: true,
      tabSize: 2,
      theme: this.theme,
      autoRefresh: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      autoCloseTags: true,
      extraKeys: {
        Tab: 'emmetExpandAbbreviation',
        Enter: 'emmetInsertLineBreak',
      },
    },

    js: {
      // codemirror options
      mode: 'javascript',
      keyMap: 'sublime',
      lineNumbers: true,
      autofocus: true,
      tabSize: 2,
      theme: this.theme,
      autoRefresh: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      autoCloseTags: true,
    },
  };
}
