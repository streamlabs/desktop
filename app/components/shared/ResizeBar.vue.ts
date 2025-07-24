import TsxComponent, { createProps } from 'components/tsx-component';
import { Component, Prop } from 'vue-property-decorator';

class ResizeBarProps {
  // the side of the external container to stick ResizeBar to
  position: 'left' | 'right' | 'top' = 'left';
  value?: number = 0;
  min: number = -Infinity;
  max: number = Infinity;
  // by default ResizeBar increases the value when move to bottom/right
  // and decreases when move to left/top
  // change this option to reverse this behavior
  reverse: boolean = false;
  onResizestart: () => void = null;
  onResizestop: () => void = null;
  onInput?: (val: number) => void = null;
}

/**
 * This component can be added to any element as a resize control
 */
@Component({ props: createProps(ResizeBarProps) })
export default class ResizeBar extends TsxComponent<ResizeBarProps> {
  active = false; // true when it's dragging
  transform = ''; // css-transform prop ResizeBar

  private barOffset = 0;
  private mouseInitial = 0;

  private get hasConstraints() {
    return this.props.max !== Infinity || this.props.min !== -Infinity;
  }

  onMouseDownHandler(event: MouseEvent) {
    // Handle cases where the window size is too small to allow resizing
    if (this.props.max <= this.props.min) return;
    this.startMouseTracking(event);
  }

  startMouseTracking(event: MouseEvent) {
    this.active = true;
    const mouseMoveListener = (event: MouseEvent) => this.onMouseMoveHandler(event);
    this.$root.$el.addEventListener('mousemove', mouseMoveListener);
    this.$root.$el.addEventListener(
      'mouseup',
      (event: MouseEvent) => {
        this.$root.$el.removeEventListener('mousemove', mouseMoveListener);
        this.stopMouseTracking(event);
      },
      { once: true },
    );
    this.$root.$el.addEventListener(
      'mouseleave',
      (event: MouseEvent) => {
        this.$root.$el.removeEventListener('mousemove', mouseMoveListener);
        this.stopMouseTracking(event);
      },
      { once: true },
    );

    this.mouseInitial = this.isHorizontal ? event.pageX : event.pageY;
    this.$emit('resizestart', event);
  }

  stopMouseTracking(event: MouseEvent) {
    if (!this.active) return;

    this.active = false;
    let offset = this.barOffset;
    if (this.props.reverse) offset = -offset;
    this.barOffset = 0;
    this.mouseInitial = 0;
    this.updateTransform();
    this.$emit('resizestop', offset, event);
    this.$emit('input', offset + this.props.value, event);
  }

  onMouseMoveHandler(event: MouseEvent) {
    const mouseOffset = (this.isHorizontal ? event.pageX : event.pageY) - this.mouseInitial;

    // handle max and min constraints
    if (this.hasConstraints) {
      const value = this.props.reverse
        ? this.props.value - mouseOffset
        : this.props.value + mouseOffset;

      if (value > this.props.max) {
        this.barOffset = this.props.reverse
          ? this.props.value - this.props.max
          : this.props.max - this.props.value;
      } else if (value < this.props.min) {
        this.barOffset = this.props.reverse
          ? this.props.value - this.props.min
          : this.props.min - this.props.value;
      } else {
        this.barOffset = mouseOffset;
      }
    } else {
      this.barOffset = mouseOffset;
    }

    this.updateTransform();
  }

  get isHorizontal() {
    return ['left', 'right'].includes(this.props.position);
  }

  private updateTransform() {
    this.transform = this.isHorizontal
      ? `translateX(${this.barOffset}px)`
      : `translateY(${this.barOffset}px)`;
  }
}
