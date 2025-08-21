import React from 'react';
import { shell } from '@electron/remote';
import cx from 'classnames';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import styles from './MarketingModal.m.less';
import { $t } from 'services/i18n';
import { Carousel } from 'antd';

export default function MarketingModal() {
  const bannerInfo = {
    title: '',
    description: '',
    buttonText: '',
    buttonLink: '',
  };

  function handleButton(url: string) {
    shell.openExternal(url);
  }

  return (
    <ModalLayout>
      <h2>{$t('New Updates to Streamlabs Desktop')}</h2>
      <div className={cx(styles.cell, styles.main)}>
        <img className={styles.image} src="" />
        <div>
          <h3>{bannerInfo.title}</h3>
          <span>{bannerInfo.description}</span>
          <button onClick={() => handleButton(bannerInfo.buttonLink)}>
            {bannerInfo.buttonText}
          </button>
        </div>
      </div>
      <Carousel></Carousel>
    </ModalLayout>
  );
}
