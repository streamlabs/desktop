import { Component } from 'vue-property-decorator';
import { IHotkey, IBinding } from 'services/hotkeys';
import TsxComponent, { createProps } from 'components/tsx-component';
import { byOS, OS } from 'util/operating-systems';
import TextInput from './inputs/TextInput';
import { Inject } from 'services';
import { MarkersService } from 'app-services';

/**
 * Represents a binding that has a unique key for CSS animations
 */
interface IKeyedBinding {
  binding: IBinding;
  key: string;
}

class HotkeyProps {
  hotkey: IHotkey = {} as IHotkey;
}

@Component({ props: createProps(HotkeyProps), components: { TextInput } })
export default class HotkeyComponent extends TsxComponent<HotkeyProps> {
  @Inject() markersService: MarkersService;

  description: string;
  bindings: IKeyedBinding[] = [];

  hotkey: IHotkey;

  created() {
    this.hotkey = this.props.hotkey;
    this.description = this.props.hotkey.description;
    if (this.props.hotkey.bindings.length === 0) {
      this.bindings = [this.createBindingWithKey(this.getBlankBinding())];
    } else {
      this.bindings = Array.from(this.props.hotkey.bindings).map(binding => {
        return this.createBindingWithKey(binding);
      });
    }
  }

  handlePress(event: KeyboardEvent | MouseEvent, index: number) {
    // We don't allow binding left or right click
    if (event instanceof MouseEvent && (event.button === 0 || event.button === 2)) return;

    // We don't allow binding a modifier by instelf
    if (event instanceof KeyboardEvent && this.isModifierPress(event)) return;

    event.preventDefault();

    const binding = this.bindings[index];

    const key =
      /*eslint-disable*/
      event instanceof MouseEvent
        ? {
            1: 'MiddleMouseButton',
            3: 'X1MouseButton',
            4: 'X2MouseButton',
          }[event.button]
        : event.code;
    binding.binding = {
      key,
      modifiers: this.getModifiers(event),
    };

    this.setBindings();
  }

  getModifiers(event: KeyboardEvent | MouseEvent) {
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
      key: Math.random()
        .toString(36)
        .substring(2, 15),
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

    this.props.hotkey.bindings = bindings;
  }

  /**
   * Turns a binding into a string representation
   */
  getBindingString(binding: IBinding) {
    const keys: string[] = [];

    if (binding.modifiers.alt) keys.push(byOS({ [OS.Windows]: 'Alt', [OS.Mac]: 'Opt' }));
    if (binding.modifiers.ctrl) keys.push('Ctrl');
    if (binding.modifiers.shift) keys.push('Shift');
    if (binding.modifiers.meta) keys.push(byOS({ [OS.Windows]: 'Win', [OS.Mac]: 'Cmd' }));

    let key = binding.key;

    const matchDigit = binding.key.match(/^Digit([0-9])$/);
    if (matchDigit) key = matchDigit[1];

    const matchKey = binding.key.match(/^Key([A-Z])$/);
    if (matchKey) key = matchKey[1];

    if (key === 'MiddleMouseButton') key = 'Mouse 3';
    if (key === 'X1MouseButton') key = 'Mouse 4';
    if (key === 'X2MouseButton') key = 'Mouse 5';

    keys.push(key);

    return keys.join('+');
  }

  get markerValue() {
    if (!this.hotkey.isMarker) return '';
    return this.markersService.views.getLabel(this.hotkey.actionName);
  }

  set markerValue(value: string) {
    if (!this.hotkey.isMarker) return;
    this.markersService.actions.setMarkerName(this.hotkey.actionName, value);
  }
}
