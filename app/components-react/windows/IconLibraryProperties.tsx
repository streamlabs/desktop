import cx from 'classnames';
import path from 'path';
import fs from 'fs';
import { ModalLayout } from '../shared/ModalLayout';
import { $t } from '../../services/i18n';
import React, { useEffect, useState } from 'react';
import { Services } from '../service-provider';
import { FileInput } from '../shared/inputs';
import Scrollable from '../shared/Scrollable';
import styles from './IconLibraryProperties.m.less';
import { useChildWindowParams } from 'components-react/hooks';

export default () => {
  // inject services
  const { SourcesService, WindowsService, CustomizationService } = Services;

  const sourceId = useChildWindowParams('sourceId');
  const source = SourcesService.views.getSource(sourceId);

  const [folderPath, setFolderPath] = useState('');
  const [folderImages, setFolderImages] = useState([] as string[]);
  const [selectedIcon, setSelectedIcon] = useState('');
  const [errorState, setErrorState] = useState(false);

  useEffect(lifecycle, []);

  function lifecycle() {
    if (source) {
      const settings = source.getPropertiesManagerSettings();
      if (settings.folder) {
        const { folder, activeIcon } = settings;
        setFolderPath(folder);

        fs.readdir(folder, (err: Error, files: string[]) => {
          if (err) return setErrorState(true);
          setFolderImages(files.map((file: string) => path.join(folder, file)));
        });

        setSelectedIcon(activeIcon);
      }
    }
  }

  function selectFolder(folder: string) {
    if (!source) return;
    setFolderPath(folder);

    fs.readdir(folder, (err: Error, files: string[]) => {
      if (err) return setErrorState(true);
      setFolderImages(files.map((file: string) => path.join(folder, file)));
      const activeIconPath = path.join(folder, files[0]);
      selectIcon(activeIconPath);
      source.setPropertiesManagerSettings({
        folder,
        activeIcon: activeIconPath,
      });
    });
  }

  function selectIcon(iconPath: string) {
    if (!source) return;
    setSelectedIcon(iconPath);
    source.setPropertiesManagerSettings({ activeIcon: iconPath });
  }

  const filters = [{ name: 'Images', extensions: ['jpg', 'png', 'gif'] }];

  function PreviewImage() {
    if (!selectedIcon) return <div />;
    return <ImageCell path={selectedIcon} isSelected={false} large={true} handleClick={() => {}} />;
  }

  return (
    <ModalLayout fixedChild={<PreviewImage />} onOk={() => WindowsService.closeChildWindow()}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {CustomizationService.state.designerMode && (
          <FileInput
            onChange={selectFolder}
            value={folderPath}
            directory={true}
            filters={filters}
          />
        )}
        <Scrollable snapToWindowEdge isResizable={false} style={{ height: '100%' }}>
          <div className={styles.cellContainer}>
            {errorState ? (
              <div>{$t('An error has occured, please try re-opening this window')}</div>
            ) : (
              folderImages.map(image => (
                <ImageCell
                  path={image}
                  isSelected={image === selectedIcon}
                  handleClick={selectIcon}
                  key={image}
                />
              ))
            )}
          </div>
        </Scrollable>
      </div>
    </ModalLayout>
  );
};

interface IImageCellProps {
  path: string;
  isSelected: boolean;
  handleClick: Function;
  large?: boolean;
}

const ImageCell = (p: IImageCellProps) => (
  <div
    className={cx(styles.imageCell, {
      [styles.selected]: p.isSelected,
      [styles.large]: p.large,
    })}
    onClick={() => p.handleClick(p.path)}
  >
    <img src={p.path} />
  </div>
);
