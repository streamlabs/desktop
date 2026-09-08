import React, { HTMLAttributes, useEffect, useRef, useState } from 'react';
import Animation from 'rc-animate';
import css from './Spinner.m.less';
import cx from 'classnames';

const spinnerSvg =
  '<div class="s-spinner"><div size="small" class="s-bars"><svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 28 40" class="s-spinner--small"><path d="M0 0, l0 4, l0 -4" id="s-bar-y-path"></path> <rect width="4" height="34.3707" x="0" y="0" ry="2" rx="2" class="s-spinner__bar"><animate attributeName="opacity" values=".24; .08; .24" begin="0s" dur="1.2s" repeatCount="indefinite"></animate> <animate attributeName="height" values="40; 32; 40" begin="0s" dur="1.2s" repeatCount="indefinite"></animate> <!----> <animateMotion begin="0s" dur="1.2s" repeatCount="indefinite"><mpath xlink:href="#s-bar-y-path"></mpath></animateMotion></rect> <rect width="4" height="34.9627" x="12" y="0" ry="2" rx="2" class="s-spinner__bar"><animate attributeName="opacity" values=".24; .24; .24" begin="0s" dur="0.4s"></animate> <animate attributeName="opacity" values=".24; .08; .24" begin="0.4s" dur="1.2s" repeatCount="indefinite"></animate> <animate attributeName="height" values="40; 32; 40" begin="0.4s" dur="1.2s" repeatCount="indefinite"></animate> <!----> <animateMotion begin="0.4s" dur="1.2s" repeatCount="indefinite"><mpath xlink:href="#s-bar-y-path"></mpath></animateMotion></rect> <rect width="4" height="40" x="24" y="0" ry="2" rx="2" class="s-spinner__bar"><animate attributeName="opacity" values=".24; .24; .24" begin="0s" dur="0.8s"></animate> <animate attributeName="opacity" values=".24; .08; .24" begin="0.8s" dur="1.2s" repeatCount="indefinite"></animate> <animate attributeName="height" values="40; 32; 40" begin="0.8s" dur="1.2s" repeatCount="indefinite"></animate> <!----> <animateMotion begin="0.8s" dur="1.2s" repeatCount="indefinite"><mpath xlink:href="#s-bar-y-path"></mpath></animateMotion></rect></svg></div></div>';

export default function Spinner(
  props: {
    visible?: boolean;
    delay?: number;
    relative?: boolean;
    pageLoader?: boolean;
  } & HTMLAttributes<unknown> = {},
) {
  const defaultProps = { visible: false, delay: 0, relative: false, pageLoader: false };
  const p = { ...defaultProps, ...props };
  const timeoutRef = useRef(0);

  const [visibility, setVisibility] = useState({
    isContainerVisible: p.visible,
    isSpinnerVisible: p.visible,
  });

  useEffect(() => {
    if (p.visible) {
      // if switched to visible then render container first
      setVisibility({ isContainerVisible: true, isSpinnerVisible: false });
      // then show spinner
      timeoutRef.current = window.setTimeout(() => {
        setVisibility({ isContainerVisible: true, isSpinnerVisible: true });
      });
    } else {
      // if switched to invisible then render container without spinner
      setVisibility({ isContainerVisible: true, isSpinnerVisible: false });
      // then hide container
      timeoutRef.current = window.setTimeout(() => {
        setVisibility({ isContainerVisible: false, isSpinnerVisible: false });
      });
    }

    return () => {
      window.clearTimeout(timeoutRef.current);
    };
  }, [p.visible]);

  const classNames = cx({
    [css.container]: true,
    [css.hasVisibleSpinner]: visibility.isSpinnerVisible,
    [css.spinnerRelative]: p.relative,
    [css.pageLoader]: p.pageLoader,
  });

  return (
    <Animation transitionName="ant-fade">
      {visibility.isContainerVisible && (
        <div className={classNames} key="spinner" style={{ transitionDelay: `${p.delay}ms` }}>
          <div className={css.spinner} dangerouslySetInnerHTML={{ __html: spinnerSvg }}></div>
        </div>
      )}
    </Animation>
  );
}
