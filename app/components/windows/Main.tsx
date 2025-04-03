import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import cx from 'classnames';
import TsxComponent from 'components/tsx-component';
import { Main, Loader } from 'components/shared/ReactComponentList';
import { Inject } from 'services';
import { CustomizationService } from 'app-services';
import antdThemes from 'styles/antd/index';
import styles from 'components-react/windows/Main.m.less';
import { TApplicationTheme } from 'services/customization';

const loadedTheme = () => {
  const customizationState = localStorage.getItem('PersistentStatefulService-CustomizationService');
  if (customizationState) {
    return JSON.parse(customizationState)?.theme;
  }
};

@Component({})
export default class MainWindow extends TsxComponent {
  @Inject() customizationService: CustomizationService;

  get uiReady() {
    return this.$store.state.bulkLoadFinished && this.$store.state.i18nReady;
  }

  theme: TApplicationTheme = 'night-theme';

  unbind: () => void;

  mounted() {
    this.unbind = this.customizationService.state.bindProps(this, {
      theme: 'theme',
    });

    antdThemes[this.theme].use();
  }

  destroyed() {
    this.unbind();
  }

  render() {
    return (
      <div style={{ height: '100%' }} className={this.theme}>
        {this.uiReady && <Main />}
        <transition name="loader">
          {!this.uiReady && (
            <div
              className={cx(styles.mainLoading, this.theme, {
                [styles.initialLoading]: !this.uiReady,
              })}
            >
              <Loader componentProps={{ className: this.theme }} />
            </div>
          )}
        </transition>
      </div>
    );
  }
}
