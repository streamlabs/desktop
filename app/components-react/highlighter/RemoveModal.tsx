import { Button, Checkbox } from 'antd';
import { Services } from 'components-react/service-provider';
import React, { useState } from 'react';
import { TClip } from 'services/highlighter/models/highlighter.models';
import { $t } from 'services/i18n';
import styles from './RemoveModal.m.less';
import { SCRUB_HEIGHT, SCRUB_WIDTH } from 'services/highlighter/constants';

export default function RemoveModal(p: {
  removeType: 'clip' | 'stream';
  clip: TClip;
  streamId: string | undefined;
  close: () => void;
  deleteClip: (clipPath: string[], streamId: string | undefined) => void;
}) {
  const { HighlighterService } = Services;
  const [deleteAllSelected, setDeleteAllSelected] = useState<boolean>(false);
  const [clipsToDelete, setClipsToDelete] = useState<TClip[]>([p.clip]);

  function getClipsToDelete(): TClip[] {
    return HighlighterService.getClips(HighlighterService.views.clips, p.streamId).filter(
      clip => clip.path !== p.clip.path && clip.enabled,
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{p.removeType === 'stream' ? $t('Delete stream') : $t('Delete clips')}</h2>
        <Button type="text" onClick={p.close}>
          <i className="icon-close" style={{ margin: 0 }}></i>
        </Button>
      </div>

      <div style={{ position: 'relative', height: `${SCRUB_HEIGHT}px`, marginTop: '32px' }}>
        {clipsToDelete.slice(0, 3).map((clip, index) => (
          <React.Fragment key={clip.path}>
            <div
              className={styles.thumbnail}
              style={{
                width: `${SCRUB_WIDTH / 2}px`,
                height: `${SCRUB_HEIGHT / 2}px`,
                rotate: `${clipsToDelete.length !== 1 ? (index - 1) * 6 : 0}deg`,
                scale: '1.2',
                transform: `translate(${clipsToDelete.length > 1 ? (index - 1) * 9 : 0}px, ${
                  index === 1 ? 0 + 4 : 2 + 4
                }px)`,
                zIndex: index === 1 ? 10 : 0,
              }}
            >
              <img src={clip.scrubSprite} />{' '}
            </div>
          </React.Fragment>
        ))}
        {clipsToDelete.length > 1 && (
          <span className={styles.selectedForDeletion}>
            {$t('%{clipsAmountToDelete} clips selected for deletion', {
              clipsAmountToDelete: clipsToDelete.length,
            })}
          </span>
        )}
      </div>

      <div>
        <Checkbox
          style={{ marginBottom: '24px' }}
          checked={deleteAllSelected}
          onChange={e => {
            setDeleteAllSelected(e.target.checked);
            if (e.target.checked) {
              setClipsToDelete([...getClipsToDelete(), p.clip]);
            } else {
              setClipsToDelete([p.clip]);
            }
          }}
        >
          {$t('Delete all selected clips')}
        </Checkbox>
        <div>
          <Button
            type="primary"
            style={{ width: '100%' }}
            danger
            onClick={() => {
              const clipsToDelete: TClip[] = [p.clip];
              if (deleteAllSelected) {
                const selectedClipsToDelete = HighlighterService.getClips(
                  HighlighterService.views.clips,
                  p.streamId,
                ).filter(clip => clip.path !== p.clip.path && clip.enabled); // prevent adding the same clip twice
                clipsToDelete.push(...selectedClipsToDelete);
              }

              clipsToDelete.forEach(clip => {
                HighlighterService.actions.removeClip(clip.path, p.streamId);
              });
              const clipsToDeletePaths = clipsToDelete.map(clip => clip.path);
              p.deleteClip(clipsToDeletePaths, p.streamId);
              p.close();
            }}
          >
            {$t('Delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
