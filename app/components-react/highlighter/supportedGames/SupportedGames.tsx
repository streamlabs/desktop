import React from 'react';
import styles from './SupportedGames.m.less';
import { supportedGames } from 'services/highlighter/models/game-config.models';
import { Tooltip } from 'antd';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';

export default function SupportedGames({ emitClick }: { emitClick?: (game: EGame) => void }) {
  const rotation = ['4.654deg', '-3.9deg', '5.24deg', '-2.58deg'];
  return (
    <div style={{ display: 'flex' }}>
      {supportedGames.slice(0, 4).map((game, index) => (
        <div
          key={game.value + index}
          onClick={e => emitClick && emitClick(game.value)}
          className={styles.thumbnail}
          style={
            {
              '--rotation': rotation[index],
            } as React.CSSProperties
          }
        >
          <img src={game.image} alt={game.label} />
        </div>
      ))}
      {/* Coming with next PR
      <Tooltip title="More games">
        <div
          className={styles.thumbnail}
          style={{
            marginRight: '-8px',
            fontSize: '12px',
            fontWeight: 'bold',
            width: '40px',
            height: '40px',
            backgroundColor: 'gray',
            display: 'grid',
            placeContent: 'center',
          }}
        >
          more
        </div>
      </Tooltip> */}
    </div>
  );
}
