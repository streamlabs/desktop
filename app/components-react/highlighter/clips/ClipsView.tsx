import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as remote from '@electron/remote';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import styles from './ClipsView.m.less';
import { TClip } from 'services/highlighter/models/highlighter.models';
import ClipPreview from 'components-react/highlighter/clips/ClipPreview';
import { ReactSortable } from 'react-sortablejs';
import Scrollable from 'components-react/shared/Scrollable';
import { EditingControls } from './EditingControls';
import { MIN_SELECTED_CLIPS_FOR_EDITOR, sortClipsByOrder, useOptimizedHover } from './utils';
import ClipsViewModal from './ClipsViewModal';
import { useVuex } from 'components-react/hooks';
import { Button } from 'antd';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import path from 'path';

export type TModalClipsView = 'trim' | 'export' | 'preview' | 'remove';

// Room left below the intro on the first screen: the clips header plus the top of the thumbnails
const CLIPS_PEEK_HEIGHT = 160;

/**
 * Body of the Highlighter page: whatever is passed as children on top, then the grid of all
 * clips. The editor panel slides in beside the clips (not the children) once enough clips are
 * selected to edit a video.
 * With `fillIntro` the children take up nearly the full visible height, leaving just enough room
 * for the top of the clips to peek out so users can tell there is more to scroll to.
 */
export default function ClipsView({
  children,
  fillIntro = false,
}: {
  children?: React.ReactNode;
  fillIntro?: boolean;
}) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const clipsAmount = useVuex(() => HighlighterService.views.clips.length);
  const selectedAmount = useVuex(
    () => HighlighterService.views.clips.filter(clip => clip.enabled && !clip.deleted).length,
  );
  const showEditor = selectedAmount >= MIN_SELECTED_CLIPS_FOR_EDITOR;
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

  // The scroll content has no definite height, so percentage heights do not resolve inside it.
  // Measure the visible height instead and hand it to the intro and clips area as pixel values.
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollHostRef.current) return;
    const ro = new ResizeObserver(([entry]) => setViewportHeight(entry.contentRect.height));
    ro.observe(scrollHostRef.current);
    return () => ro.disconnect();
  }, []);

  function shareFeedback() {
    remote.shell.openExternal(
      'https://support.streamlabs.com/hc/en-us/requests/new?ticket_form_id=31967205905051',
    );
  }

  function renderClips() {
    if (clips.length === 0) {
      return <div className={styles.emptyState}>{$t('No clips found')}</div>;
    }

    if (!clipsLoaded) return <ClipsLoadingView />;

    return (
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
    );
  }

  return (
    <div ref={containerRef} className={styles.clipsViewRoot}>
      <div ref={scrollHostRef} className={styles.pageScroll}>
        <Scrollable style={{ height: '100%' }}>
          {fillIntro ? (
            <div
              className={styles.intro}
              style={{ minHeight: Math.max(viewportHeight - CLIPS_PEEK_HEIGHT, 0) || undefined }}
            >
              {children}
            </div>
          ) : (
            children
          )}
          {/* At least one screen tall, so the sticky editor panel beside the clips always has
              its full height and never sits next to the content above */}
          <div className={styles.clipsArea} style={{ minHeight: viewportHeight || undefined }}>
            <section className={styles.clipsSection} onDrop={onDrop}>
              <div className={styles.clipsHeader}>
                <h3 className={styles.clipsTitle}>{$t('All clips')}</h3>
                <div className={styles.clipsHeaderActions}>
                  <Button
                    type="text"
                    icon={<i className="icon-community" style={{ marginRight: 8 }} />}
                    onClick={shareFeedback}
                  >
                    {$t('Share feedback')}
                  </Button>
                  <AddClip addedClips={() => setClips(sortClips(getClips()))} />
                </div>
              </div>
              {renderClips()}
            </section>
            <div
              className={cx(styles.editorPanel, { [styles.editorPanelVisible]: showEditor })}
              style={{ height: viewportHeight || '100%' }}
              aria-hidden={!showEditor}
            >
              <EditingControls
                emitSetShowModal={(modal: TModalClipsView | null) => {
                  if (modal) {
                    setModal({ modal });
                  }
                }}
              />
            </div>
          </div>
        </Scrollable>
      </div>
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
