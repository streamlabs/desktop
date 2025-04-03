import React, { Component } from 'react';
import uuid from 'uuid';
import { I18nService } from '../../services/i18n';
import { StatefulService } from '../../services/core/stateful-service';
import Vue from 'vue';
import isEqual from 'lodash/isEqual';

interface IProps {
  componentClass: any;
  componentProps: any;
}

/**
 * Wraps Vue component into a React component
 */
export class VueComponent extends Component<IProps, { id: string; vueInstance: Vue | null }> {
  wrapperRef = React.createRef<HTMLDivElement>();

  constructor(props: IProps) {
    super(props);
    this.state = { id: uuid(), vueInstance: null };
  }

  componentDidMount() {
    const { componentClass, componentProps } = this.props;
    const { id } = this.state;
    const vueInstance = new Vue({
      i18n: I18nService.vueI18nInstance,
      store: StatefulService.store,
      el: `#component-${id}`,
      data() {
        return { componentClass, componentProps };
      },
      methods: {
        updateProps(newProps: { componentClass: typeof Vue; componentProps: unknown }) {
          this['componentClass'] = newProps.componentClass;
          this['componenentProps'] = newProps.componentProps;
        },
      },
      render(h) {
        return h(this['componentClass'], { props: this['componentProps'] });
      },
    });
    this.setState({ ...this.state, vueInstance });
  }

  componentDidUpdate(props: IProps): void {
    this.state.vueInstance!['updateProps'](props);
  }

  shouldComponentUpdate(nextProps: IProps): boolean {
    return (
      nextProps.componentClass !== this.props.componentClass || !isEqual(nextProps, this.props)
    );
  }

  render() {
    return (
      <div
        className="vue-component-wrapper"
        ref={this.wrapperRef}
        id={`component-${this.state.id}`}
      ></div>
    );
  }
}

// EXAMPLE: create a react component from existing vue component

// import PlatformLogo from '../../components/shared/PlatformLogo';
// interface IPlatformLogoProps {
//   platform: string;
// }
// export function PlatformLogoVue(props: IPlatformLogoProps) {
//   return <VueComponent componentClass={PlatformLogo} componentProps={props} />;
// }
