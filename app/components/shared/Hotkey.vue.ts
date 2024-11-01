import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { Hotkey, IBinding } from '../../services/hotkeys';

/**
 * Represents a binding that has a unique key for CSS animations
 */
interface IKeyedBinding {
  binding: IBinding;
  key: string;
}

@Component({
  props: ['hotkey'],
})
export default class HotkeyComponent extends Vue {
  @Prop()
  hotkey: Hotkey;

  // @ts-expect-error: ts2729: use before initialization
  description = this.hotkey.description;
  bindings: IKeyedBinding[] = [];

  created() {
    if (this.hotkey.bindings.length === 0) {
      this.bindings = [this.createBindingWithKey(this.getBlankBinding())];
    } else {
      this.bindings = Array.from(this.hotkey.bindings).map(binding => {
        return this.createBindingWithKey(binding);
      });
    }
  }

  handleKeydown(event: KeyboardEvent, index: number) {
    event.preventDefault();

    if (this.isModifierPress(event)) return;

    const binding = this.bindings[index];

    binding.binding = {
      key: event.code,
      modifiers: this.getModifiers(event),
    };

    this.setBindings();
  }

  getModifiers(event: KeyboardEvent) {
    return {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    };
  }

  isModifierPress(event: KeyboardEvent) {
    return (
      event.key === 'Control' ||
      event.key === 'Alt' ||
      event.key === 'Meta' ||
      event.key === 'Shift'
    );
  }

  /**
   * Adds a new blank binding
   */
  addBinding(index: number) {
    this.bindings.splice(index + 1, 0, this.createBindingWithKey(this.getBlankBinding()));
  }

  getBlankBinding() {
    return {
      key: '',
      modifiers: {
        alt: false,
        ctrl: false,
        shift: false,
        meta: false,
      },
    };
  }

  removeBinding(index: number) {
    // If this is the last binding, replace it with an
    // empty binding instead.
    if (this.bindings.length === 1) {
      this.bindings[0].binding = this.getBlankBinding();
    } else {
      this.bindings.splice(index, 1);
    }

    this.setBindings();
  }

  // This is kind of weird, but the key attribute allows
  // us to uniquely identify that binding in the DOM,
  // which allows CSS animations to work properly.
  createBindingWithKey(binding: IBinding): IKeyedBinding {
    return {
      binding,
      key: Math.random().toString(36).substring(2, 15),
    };
  }

  /**
   * Sets the bindings on the hotkey object
   */
  setBindings() {
    const bindings: IBinding[] = [];

    this.bindings.forEach(binding => {
      if (binding.binding.key) bindings.push(binding.binding);
    });

    this.hotkey.bindings = bindings;
  }

  /**
   * Turns a binding into a string representation
   */
  getBindingString(binding: IBinding) {
    const keys: string[] = [];

    if (binding.modifiers.alt) keys.push('Alt');
    if (binding.modifiers.ctrl) keys.push('Ctrl');
    if (binding.modifiers.shift) keys.push('Shift');
    if (binding.modifiers.meta) keys.push('Win');

    let key = binding.key;

    const matchDigit = binding.key.match(/^Digit([0-9])$/);
    if (matchDigit) key = matchDigit[1];

    const matchKey = binding.key.match(/^Key([A-Z])$/);
    if (matchKey) key = matchKey[1];

    keys.push(key);

    return keys.join('+');
  }
}
