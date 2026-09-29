import React, { useCallback, useEffect, useState } from 'react';
import * as remote from '@electron/remote';
import { Services } from 'components-react/service-provider';
import styles from './ClipsView.m.less';
import {
  EHighlighterView,
  IViewState,
  TClip,
} from 'services/highlighter/models/highlighter.models';
import ClipPreview from 'components-react/highlighter/ClipPreview';
import { ReactSortable } from 'react-sortablejs';
import Scrollable from 'components-react/shared/Scrollable';
import { EditingControls } from './EditingControls';
import { sortClipsByOrder, useOptimizedHover } from './utils';
import ClipsViewModal from './ClipsViewModal';
import { useVuex } from 'components-react/hooks';
import { Button, Tooltip } from 'antd';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import path from 'path';

export type TModalClipsView = 'trim' | 'export' | 'preview' | 'remove';

export default function ClipsView({ emitSetView }: { emitSetView: (data: IViewState) => void }) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const clipsAmount = useVuex(() => HighlighterService.views.clips.length);
  const [clips, setClips] = useState<{ id: string }[]>([]);

  const [clipsLoaded, setClipsLoaded] = useState<boolean>(false);

  const loadClips = useCallback(async () => {
    await HighlighterService.actions.return.loadClips();
    setClipsLoaded(true);
  }, []);

  const getClips = useCallback(() => {
    return HighlighterService.getClips(HighlighterService.views.clips);
  }, []);

  useEffect(() => {
    setClipsLoaded(false);
    setClips(sortClips(getClips()));
    loadClips();
  }, [clipsAmount]);

  useEffect(() => UsageStatisticsService.actions.recordFeatureUsage('Highlighter'), []);

  const [modal, setModal] = useState<{ modal: TModalClipsView; inspectedPathId?: string } | null>(
    null,
  );

  function setClipOrder(listClips: { id: string }[]) {
    const newClipArray = listClips.map(c => c.id);
    const oldClipArray = clips.map(c => c.id);

    if (JSON.stringify(newClipArray) === JSON.stringify(oldClipArray)) {
      return;
    }

    newClipArray.forEach((clipPath, index) => {
      HighlighterService.actions.UPDATE_CLIP({
        path: clipPath,
        globalOrderPosition: index,
      });
    });

    setClips(newClipArray.map(clipPath => ({ id: clipPath })));
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    const extensions = SUPPORTED_FILE_TYPES.map(e => `.${e}`);
    const files: string[] = [];
    let fi = e.dataTransfer.files.length;
    while (fi--) {
      const file = e.dataTransfer.files.item(fi)?.path;
      if (file) files.push(file);
    }

    const filtered = files.filter(f => extensions.includes(path.parse(f).ext));

    if (filtered.length) {
      HighlighterService.actions.addClips(
        filtered.map(path => ({ path })),
        'Manual',
      );
    }

    e.preventDefault();
    e.stopPropagation();
  }

  const containerRef = useOptimizedHover();

  function shareFeedback() {
    remote.shell.openExternal(
      'https://support.streamlabs.com/hc/en-us/requests/new?ticket_form_id=31967205905051',
    );
  }

  return (
    <div ref={containerRef} className={styles.clipsViewRoot} onDrop={event => onDrop(event)}>
      <div className={styles.container}>
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
          <header className={styles.header}>
            <button
              className={styles.backButton}
              onClick={() => emitSetView({ view: EHighlighterView.SETTINGS })}
            >
              <i className="icon-back" />
            </button>
            <h1
              className={styles.title}
              onClick={() => emitSetView({ view: EHighlighterView.SETTINGS })}
            >
              {$t('All highlight clips')}
            </h1>
          </header>
          <div style={{ padding: '20px', display: 'flex', gap: '8px' }}>
            <Button
              type="text"
              icon={<i className="icon-community" style={{ marginRight: 8 }} />}
              onClick={shareFeedback}
            >
              {$t('Share feedback')}
            </Button>
            <PreviewExportButton setModal={setModal} />
          </div>
        </div>

        {clips.length === 0 ? (
          <div style={{ padding: '20px' }}>
            {$t('No clips found')}
            <br />
            <div>
              <AddClip addedClips={() => setClips(sortClips(getClips()))} />
            </div>
          </div>
        ) : (
          <>
            {clipsLoaded ? (
              <>
                <div className={styles.clipsControls}>
                  <AddClip addedClips={() => setClips(sortClips(getClips()))} />
                </div>
                <Scrollable className={styles.clipsContainer}>
                  <ReactSortable
                    list={clips}
                    setList={clips => setClipOrder(clips)}
                    animation={200}
                    filter=".sortable-ignore"
                    onMove={e => {
                      return e.related.className.indexOf('sortable-ignore') === -1;
                    }}
                  >
                    {clips.map(({ id }) => {
                      const clip = HighlighterService.views.clipsDictionary[id];
                      return (
                        <div key={clip.path} data-clip-id={id} className={styles.clipItem}>
                          <ClipPreview
                            clipId={id}
                            emitShowTrim={() => {
                              setModal({ modal: 'trim', inspectedPathId: id });
                            }}
                            emitShowRemove={() => {
                              setModal({ modal: 'remove', inspectedPathId: id });
                            }}
                            emitOpenFileInLocation={() => {
                              remote.shell.showItemInFolder(clip.path);
                            }}
                          />
                        </div>
                      );
                    })}
                  </ReactSortable>
                </Scrollable>
              </>
            ) : (
              <ClipsLoadingView />
            )}
          </>
        )}
      </div>
      <EditingControls
        emitSetShowModal={(modal: TModalClipsView | null) => {
          if (modal) {
            setModal({ modal });
          }
        }}
      />
      <ClipsViewModal
        modal={modal}
        onClose={() => setModal(null)}
        deleteClip={clipIds =>
          setClips(
            sortClips(
              HighlighterService.getClips(HighlighterService.views.clips).filter(
                clip => !clipIds.includes(clip.path),
              ),
            ),
          )
        }
      />
    </div>
  );
}

function AddClip({ addedClips }: { addedClips: () => void }) {
  const { HighlighterService } = Services;

  async function openClips() {
    const selections = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: $t('Video Files'), extensions: SUPPORTED_FILE_TYPES }],
    });

    if (selections && selections.filePaths) {
      await HighlighterService.actions.return.addClips(
        selections.filePaths.map(path => ({ path })),
        'Manual',
      );
      await HighlighterService.actions.return.loadClips();
      addedClips();
    }
  }
  return (
    <Button
      size="middle"
      onClick={() => openClips()}
      style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
    >
      <i className="icon-add-circle  " />
      {$t('Add Clip')}
    </Button>
  );
}

function ClipsLoadingView() {
  const { HighlighterService } = Services;
  const clips = useVuex(() => HighlighterService.getClips(HighlighterService.views.clips));

  return (
    <div className={styles.clipLoadingIndicator}>
      <h2>{$t('Loading')}</h2>
      <p>
        {clips.filter(clip => clip.loaded).length}/{clips.length} Clips
      </p>
    </div>
  );
}

function sortClips(clips: TClip[]): { id: string }[] {
  return sortClipsByOrder(clips).map(clip => ({ id: clip.path }));
}

function PreviewExportButton({
  setModal,
}: {
  setModal: (modal: { modal: TModalClipsView }) => void;
}) {
  const { HighlighterService } = Services;
  const clips = useVuex(() => HighlighterService.getClips(HighlighterService.views.clips));
  const hasClipsToExport = clips.some(clip => clip.enabled);

  return (
    <>
      <Tooltip
        title={!hasClipsToExport ? $t('Select at least one clip to preview your video') : null}
        placement="bottom"
      >
        <Button disabled={!hasClipsToExport} onClick={() => setModal({ modal: 'preview' })}>
          {$t('Preview')}
        </Button>
      </Tooltip>
      <Tooltip
        title={!hasClipsToExport ? $t('Select at least one clip to export your video') : null}
        placement="bottom"
      >
        <Button
          disabled={!hasClipsToExport}
          type="primary"
          onClick={() => setModal({ modal: 'export' })}
        >
          {$t('Export')}
        </Button>
      </Tooltip>
    </>
  );
}
