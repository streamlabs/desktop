import React, { useCallback, useEffect, useState } from 'react';
import * as remote from '@electron/remote';
import { Services } from 'components-react/service-provider';
import styles from './ClipsView.m.less';
import {
  EHighlighterView,
  IAiClip,
  IViewState,
  TClip,
} from 'services/highlighter/models/highlighter.models';
import ClipPreview, { formatSecondsToHMS } from 'components-react/highlighter/ClipPreview';
import { ReactSortable } from 'react-sortablejs';
import Scrollable from 'components-react/shared/Scrollable';
import { EditingControls } from './EditingControls';
import {
  aiFilterClips,
  getCombinedClipsDuration,
  sortClipsByOrder,
  useOptimizedHover,
} from './utils';
import ClipsViewModal from './ClipsViewModal';
import { useVuex } from 'components-react/hooks';
import { Button, Tooltip } from 'antd';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import path from 'path';
import MiniClipPreview from './MiniClipPreview';
import HighlightGenerator from './HighlightGenerator';
import { EAvailableFeatures } from 'services/incremental-rollout';

export type TModalClipsView = 'trim' | 'export' | 'preview' | 'remove';

interface IClipsViewProps {
  id: string | undefined;
  streamTitle: string | undefined;
}

export default function ClipsView({
  props,
  emitSetView,
}: {
  props: IClipsViewProps;
  emitSetView: (data: IViewState) => void;
}) {
  const { HighlighterService, UsageStatisticsService, IncrementalRolloutService } = Services;
  const aiHighlighterFeatureEnabled = IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.aiHighlighter,
  );
  const clipsAmount = useVuex(() => HighlighterService.views.clips.length);
  const [clips, setClips] = useState<{
    ordered: { id: string }[];
    orderedFiltered: { id: string }[];
  }>({ ordered: [], orderedFiltered: [] });
  const game = HighlighterService.getGameByStreamId(props.id);
  const [activeFilter, setActiveFilter] = useState('all'); // Currently not using the setActiveFilter option

  const [clipsLoaded, setClipsLoaded] = useState<boolean>(false);
  const loadClips = useCallback(async (id: string | undefined) => {
    await HighlighterService.actions.return.loadClips(id);
    setClipsLoaded(true);
  }, []);

  const getClips = useCallback(() => {
    return HighlighterService.getClips(HighlighterService.views.clips, props.id);
  }, [props.id]);

  const noClipsToExport = getClips().some(clip => clip.enabled) === false;

  useEffect(() => {
    setClipsLoaded(false);
    setClips(sortAndFilterClips(getClips(), props.id, activeFilter));
    loadClips(props.id);
  }, [props.id, clipsAmount]);

  useEffect(() => {
    setClips(sortAndFilterClips(getClips(), props.id, activeFilter));
  }, [activeFilter]);

  useEffect(() => UsageStatisticsService.actions.recordFeatureUsage('Highlighter'), []);

  const [modal, setModal] = useState<{ modal: TModalClipsView; inspectedPathId?: string } | null>(
    null,
  );

  function setClipOrder(listClips: { id: string }[], streamId: string | undefined) {
    const newOrderOfSomeItems = listClips.map(c => c.id);
    const allItemArray = clips.ordered.map(c => c.id);
    const newClipArray = createFinalSortedArray(newOrderOfSomeItems, allItemArray);
    const oldClipArray = clips.ordered.map(c => c.id);

    if (JSON.stringify(newClipArray) === JSON.stringify(oldClipArray)) {
      return;
    } else {
      if (streamId) {
        newClipArray.forEach((clipId, index) => {
          const existingClip = HighlighterService.views.clipsDictionary[clipId];
          let updatedStreamInfo;
          if (existingClip) {
            updatedStreamInfo = {
              ...existingClip.streamInfo,
              [streamId]: {
                ...existingClip.streamInfo?.[streamId],
                orderPosition: index,
              },
            };
          }

          HighlighterService.actions.UPDATE_CLIP({
            path: clipId,
            streamInfo: updatedStreamInfo,
          });
        });
      } else {
        newClipArray.forEach((clip, index) => {
          const clipPath = clip;
          HighlighterService.actions.UPDATE_CLIP({
            path: clipPath,
            globalOrderPosition: index,
          });
        });
      }

      const updatedClips = newClipArray.map(
        clipId => HighlighterService.views.clipsDictionary[clipId],
      );

      setClips({
        ordered: newClipArray.map(clipPath => ({ id: clipPath })),
        orderedFiltered: filterClipsBySource(updatedClips, activeFilter).map(clip => ({
          id: clip.path,
        })),
      });
      return;
    }
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>, streamId: string | undefined) {
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
        streamId,
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

  function getClipsView(
    streamId: string | undefined,
    sortedList: { id: string }[],
    sortedFilteredList: { id: string }[],
  ) {
    return (
      <div
        ref={containerRef}
        className={styles.clipsViewRoot}
        onDrop={event => onDrop(event, streamId)}
      >
        <div className={styles.container}>
          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
            <header className={styles.header}>
              <button
                className={styles.backButton}
                onClick={() =>
                  emitSetView(
                    streamId
                      ? { view: EHighlighterView.STREAM }
                      : { view: EHighlighterView.SETTINGS },
                  )
                }
              >
                <i className="icon-back" />
              </button>
              <h1
                className={styles.title}
                onClick={() =>
                  emitSetView(
                    streamId
                      ? { view: EHighlighterView.STREAM }
                      : { view: EHighlighterView.SETTINGS },
                  )
                }
              >
                {props.streamTitle ?? $t('All highlight clips')}
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
              <Tooltip
                title={
                  noClipsToExport ? $t('Select at least one clip to preview your video') : null
                }
                placement="bottom"
              >
                <Button disabled={noClipsToExport} onClick={() => setModal({ modal: 'preview' })}>
                  {$t('Preview')}
                </Button>
              </Tooltip>
              <Tooltip
                title={noClipsToExport ? $t('Select at least one clip to export your video') : null}
                placement="bottom"
              >
                <Button
                  disabled={noClipsToExport}
                  type="primary"
                  onClick={() => setModal({ modal: 'export' })}
                >
                  {$t('Export')}
                </Button>
              </Tooltip>
            </div>
          </div>
          {sortedList.length === 0 ? (
            <div style={{ padding: '20px' }}>
              {$t('No clips found')}
              <br />
              <div>
                <AddClip
                  streamId={props.id}
                  addedClips={() => {
                    setClips(sortAndFilterClips(getClips(), props.id, activeFilter));
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              {clipsLoaded ? (
                <>
                  <div className={styles.clipsControls}>
                    <AddClip
                      streamId={props.id}
                      addedClips={() => {
                        setClips(sortAndFilterClips(getClips(), props.id, activeFilter));
                      }}
                    />
                    {streamId &&
                      aiHighlighterFeatureEnabled &&
                      HighlighterService.getClips(HighlighterService.views.clips, props.id)
                        .filter(clip => clip.source === 'AiClip')
                        .every(clip => (clip as IAiClip).aiInfo.metadata?.round) && (
                        <HighlightGenerator
                          emitSetFilter={filterOptions => {
                            const clips = HighlighterService.getClips(
                              HighlighterService.views.clips,
                              props.id,
                            );
                            const filteredClips = aiFilterClips(clips, streamId, filterOptions);
                            const filteredClipPaths = new Set(filteredClips.map(c => c.path));

                            clips.forEach(clip => {
                              const shouldBeEnabled = filteredClipPaths.has(clip.path);
                              const isEnabled = clip.enabled;

                              if (shouldBeEnabled && !isEnabled) {
                                HighlighterService.enableClip(clip.path, true);
                              } else if (!shouldBeEnabled && isEnabled) {
                                HighlighterService.disableClip(clip.path);
                              }
                            });
                          }}
                          combinedClipsDuration={getCombinedClipsDuration(getClips())}
                          roundDetails={HighlighterService.getRoundDetails(getClips())}
                          game={game}
                        />
                      )}
                  </div>
                  <Scrollable className={styles.clipsContainer}>
                    <ReactSortable
                      list={sortedFilteredList}
                      setList={clips => setClipOrder(clips, props.id)}
                      animation={200}
                      filter=".sortable-ignore"
                      onMove={e => {
                        return e.related.className.indexOf('sortable-ignore') === -1;
                      }}
                    >
                      {sortedFilteredList.map(({ id }) => {
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
                              streamId={streamId}
                            />
                          </div>
                        );
                      })}
                    </ReactSortable>
                  </Scrollable>
                </>
              ) : (
                <ClipsLoadingView streamId={props.id} />
              )}
            </>
          )}
        </div>
        <EditingControls
          emitSetShowModal={(modal: TModalClipsView) => {
            setModal({ modal });
          }}
        />
        <ClipsViewModal
          streamId={props.id}
          modal={modal}
          onClose={() => setModal(null)}
          deleteClip={(clipId, streamId) =>
            setClips(
              sortAndFilterClips(
                HighlighterService.getClips(HighlighterService.views.clips, props.id).filter(
                  clip => clip.path !== clipId,
                ),
                streamId,
                'all',
              ),
            )
          }
        />
      </div>
    );
  }

  return getClipsView(
    props.id,
    clips.ordered.map(clip => ({ id: clip.id })),
    clips.orderedFiltered.map(clip => ({ id: clip.id })),
  );
}

// Temporary not used. Will be used in the next version
function VideoDuration({ streamId }: { streamId: string | undefined }) {
  const { HighlighterService } = Services;

  const clips = useVuex(() =>
    HighlighterService.getClips(HighlighterService.views.clips, streamId),
  );

  const totalDuration = clips
    .filter(clip => clip.enabled)
    .reduce((acc, clip) => acc + clip.duration! - clip.startTrim! - clip.endTrim!, 0);

  return <span>{formatSecondsToHMS(totalDuration)}</span>;
}

function AddClip({
  streamId,
  addedClips,
}: {
  streamId: string | undefined;
  addedClips: () => void;
}) {
  const { HighlighterService } = Services;

  async function openClips() {
    const selections = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: $t('Video Files'), extensions: SUPPORTED_FILE_TYPES }],
    });

    if (selections && selections.filePaths) {
      await HighlighterService.actions.return.addClips(
        selections.filePaths.map(path => ({ path })),
        streamId,
        'Manual',
      );
      await HighlighterService.actions.return.loadClips(streamId);
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

function ClipsLoadingView({ streamId }: { streamId: string | undefined }) {
  const { HighlighterService } = Services;
  const clips = useVuex(() =>
    HighlighterService.getClips(HighlighterService.views.clips, streamId),
  );

  return (
    <div className={styles.clipLoadingIndicator}>
      <h2>{$t('Loading')}</h2>
      <p>
        {clips.filter(clip => clip.loaded).length}/{clips.length} Clips
      </p>
    </div>
  );
}

export function clipsToStringArray(clips: TClip[]): { id: string }[] {
  return clips.map(c => ({ id: c.path }));
}

export function createFinalSortedArray(
  newOrderOfSomeItems: string[],
  allItemArray: string[],
): string[] {
  const finalArray: (string | null)[] = new Array(allItemArray.length).fill(null);
  const itemsNotInNewOrder = allItemArray.filter(item => !newOrderOfSomeItems.includes(item));

  itemsNotInNewOrder.forEach(item => {
    const index = allItemArray.indexOf(item);
    finalArray[index] = item;
  });

  let newOrderIndex = 0;
  for (let i = 0; i < finalArray.length; i++) {
    if (finalArray[i] === null) {
      finalArray[i] = newOrderOfSomeItems[newOrderIndex];
      newOrderIndex++;
    }
  }

  return finalArray.filter((item): item is string => item !== null);
}

export function filterClipsBySource(clips: TClip[], filter: string) {
  return clips.filter(clip => {
    switch (filter) {
      case 'ai':
        return clip.source === 'AiClip';
      case 'manual':
        return clip.source === 'Manual' || clip.source === 'ReplayBuffer';
      case 'all':
      default:
        return true;
    }
  });
}
export function sortAndFilterClips(clips: TClip[], streamId: string | undefined, filter: string) {
  const orderedClips = sortClipsByOrder(clips, streamId);
  const filteredClips = filterClipsBySource(orderedClips, filter);
  const ordered = orderedClips.map(clip => ({ id: clip.path }));
  const orderedFiltered = filteredClips.map(clip => ({
    id: clip.path,
  }));

  return { ordered, orderedFiltered };
}
