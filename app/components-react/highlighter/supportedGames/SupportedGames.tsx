import React from 'react';
import styles from './SupportedGames.m.less';
import { supportedGames } from 'services/highlighter/models/game-config.models';
import { Tooltip } from 'antd';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';

export default function SupportedGames({
  gamesVisible,
  emitClick,
}: {
  gamesVisible?: number;
  emitClick?: (game: EGame) => void;
}) {
  const rotation = [
    '4.654deg',
    '-3.9deg',
    '5.24deg',
    '-2.58deg',
    '4.654deg',
    '-3.9deg',
    '5.24deg',
    '-2.58deg',
  ];
  gamesVisible = gamesVisible ?? 4;
  const games = [...supportedGames];
  const gamesSortedAlphabetical = [...supportedGames].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  return (
    <div style={{ display: 'flex' }}>
      {games.slice(0, gamesVisible).map((game, index) => (
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
      {games.length > gamesVisible && (
        <Tooltip
          overlay={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start', // Align items to the left
                justifyContent: 'flex-start', // Align content to the top
                padding: '16px',
                marginTop: '8px',
              }}
            >
              <h1 style={{ marginBottom: '8px' }}>Supported games</h1>
              {gamesSortedAlphabetical.map((game, index) => (
                <div
                  onClick={e => emitClick && emitClick(game.value)}
                  key={game.value + index}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    marginBottom: 8,
                    width: '100%',
                    alignItems: 'center', // Ensure items inside each row are aligned properly
                    justifyContent: 'flex-start', // Align items to the left
                  }}
                >
                  <img
                    width={'40px'}
                    height={'40px'}
                    className={styles.thumbnail}
                    style={{ marginRight: 0 }}
                    src={game.image}
                    alt={game.label}
                  />
                  <p style={{ marginBottom: 0, marginLeft: 4 }}>{game.label}</p>
                </div>
              ))}
            </div>
          }
        >
          <div
            className={styles.thumbnail}
            style={{
              marginRight: '-8px',
              fontSize: '12px',
              color: 'white',
              width: '40px',
              height: '40px',
              backgroundColor: 'gray',
              display: 'grid',
              placeContent: 'center',
            }}
          >
            more
          </div>
        </Tooltip>
      )}
    </div>
  );
}
