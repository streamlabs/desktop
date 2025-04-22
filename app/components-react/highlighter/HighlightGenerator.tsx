import React, { useEffect, useRef, useState } from 'react';
import { Button, Select, Checkbox, Typography } from 'antd';
import { DownOutlined, RobotOutlined } from '@ant-design/icons';
import { IFilterOptions } from './utils';
import styles from './HighlightGenerator.m.less';
import { formatSecondsToHMS } from './ClipPreview';
import { $t } from 'services/i18n';
import { EGame, IInput } from 'services/highlighter/models/ai-highlighter.models';
import Translate from 'components-react/shared/Translate';
import { getConfigByGame, getEventConfig } from 'services/highlighter/models/game-config.models';
const { Option } = Select;

const selectStyles = {
  width: '220px',
  borderRadius: '8px',
};

const dropdownStyles = {
  borderRadius: '10px',
  padding: '4px 4px',
};

const checkboxStyles = {
  borderRadius: '8px',
  width: '100%',
};

export default function HighlightGenerator({
  combinedClipsDuration,
  game,
  roundDetails,
  emitSetFilter,
}: {
  combinedClipsDuration: number; // Maximum duration the highlight reel can be long - only used to restrict the targetDuration options
  game: EGame;
  roundDetails: {
    round: number;
    inputs: IInput[];
    duration: number;
    hypeScore: number;
  }[];
  emitSetFilter: (filter: IFilterOptions) => void;
}) {
  const [selectedRounds, setSelectedRounds] = useState<number[]>([0]);
  const [filterType, setFilterType] = useState<'duration' | 'hypescore'>('duration');
  const [targetDuration, setTargetDuration] = useState(combinedClipsDuration + 100);
  const options = [
    {
      value: 1,
      label: $t('%{duration} minute', { duration: 1 }),
    },
    ...[2, 5, 10, 12, 15, 20, 30].map(value => ({
      value,
      label: $t('%{duration} minutes', { duration: value }),
    })),
  ];
  const filteredOptions = options.filter(option => option.value * 60 <= combinedClipsDuration);
  const isFirstRender = useRef(true);
  useEffect(() => {
    // To not emit on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    emitSetFilter({
      rounds: selectedRounds,
      targetDuration: filterType === 'duration' ? targetDuration * 60 : 9999,
      includeAllEvents: true,
    });
  }, [selectedRounds, filterType, targetDuration]);

  function roundDropdownDetails(
    roundDetails: {
      round: number;
      inputs: IInput[];
      duration: number;
      hypeScore: number;
    },
    game: EGame,
  ) {
    const eventTypeCounts: Record<string, number> = {};

    roundDetails.inputs.forEach(input => {
      const inputTypes = getEventConfig(game, input.type);

      if (inputTypes?.includeInDropdown) {
        if (eventTypeCounts[input.type]) {
          eventTypeCounts[input.type] += 1;
        } else {
          eventTypeCounts[input.type] = 1;
        }
      }
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontWeight: 'bold' }}>Round {roundDetails.round} </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {Object.entries(eventTypeCounts).map(([type, count]) => (
            <div className={styles.infoTag}>
              {count}
              {getEventConfig(game, type).emoji}
            </div>
          ))}

          <div className={styles.infoTag}>{`${roundDetails.hypeScore} 🔥`}</div>
          <div className={styles.infoTag}>{`${formatSecondsToHMS(roundDetails.duration)}`}</div>
        </div>
      </div>
    );
  }

  return (
    <h3
      className={styles.wrapper}
      style={{
        color: '#FFFFFF',
        margin: 0,
        fontWeight: 400,
      }}
    >
      🤖{' '}
      <Translate
        message={$t(
          'Create highlight video of <roundSelect></roundSelect> with a duration of <minutesSelect></minutesSelect>',
        )}
        renderSlots={{
          roundSelect: () => (
            <Select
              style={selectStyles}
              mode="multiple"
              value={selectedRounds}
              maxTagCount={2}
              suffixIcon={<DownOutlined style={{ color: '#FFFFFF', fontSize: '12px' }} />}
              tagRender={({ value }) => (
                <span className={styles.tag}>
                  {value === 0
                    ? $t('All Rounds')
                    : $t('Round %{roundNumber}', { roundNumber: value })}
                </span>
              )}
              dropdownStyle={dropdownStyles}
            >
              <div key="all-rounds" className={styles.option}>
                <Checkbox
                  style={checkboxStyles}
                  checked={selectedRounds.includes(0)}
                  onChange={e => {
                    setSelectedRounds(e.target.checked ? [0] : []);
                  }}
                >
                  {$t('All Rounds')}
                </Checkbox>
              </div>
              {roundDetails.map(roundDetails => (
                <div key={'in-wrapper-round' + roundDetails.round} className={styles.option}>
                  <Checkbox
                    style={checkboxStyles}
                    checked={selectedRounds.includes(roundDetails.round)}
                    onChange={e => {
                      if (e.target.checked) {
                        const newSelection = [
                          ...selectedRounds.filter(r => r !== 0),
                          roundDetails.round,
                        ];
                        setSelectedRounds(newSelection);
                      } else {
                        const newSelection = selectedRounds.filter(r => r !== roundDetails.round);
                        setSelectedRounds(newSelection.length === 0 ? [0] : newSelection);
                      }
                    }}
                  >
                    {roundDropdownDetails(roundDetails, game)}
                  </Checkbox>
                </div>
              ))}
            </Select>
          ),
          minutesSelect: () => (
            <Select
              style={{ width: '116px' }}
              value={targetDuration}
              onChange={value => setTargetDuration(value)}
              dropdownStyle={dropdownStyles}
            >
              {filteredOptions.map(option => (
                <Option key={option.value} value={option.value} className={styles.option}>
                  {option.label}
                </Option>
              ))}
              <Option value={combinedClipsDuration + 100} className={styles.option}>
                {$t('unlimited')}
              </Option>
            </Select>
          ),
        }}
      ></Translate>
      <Button
        type="text"
        onClick={() => {
          setSelectedRounds([0]);
          setFilterType('duration');
          setTargetDuration(combinedClipsDuration + 100);
        }}
        icon={<span style={{ color: '#666666', fontSize: '20px' }}>&times;</span>}
        className={styles.resetButton}
      />
    </h3>
  );
}
