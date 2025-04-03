import React from 'react';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import { $t } from 'services/i18n';
import { metadata } from 'components-react/shared/inputs/metadata';
import { TextInput, SliderInput, ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import componentMap from './games';
import { Menu } from 'antd';

type TGameType = 'tic-tac-toe' | 'chat-word';

export interface ITicTacToeOptions {
  background_color: string;
  border_color: string;
  chat_marker_color: string;
  ai_marker_color: string;
  chat_win_marker_color: string;
  ai_win_marker_color: string;
  chat_won_game_message: string;
  chat_lost_game_message: string;
  draw_game_message: string;
  chat_marker: string;
  ai_marker: string;
  game_ended_message_duration: number;
  chat_turn_message: string;
  ai_turn_message: string;
  cannot_play_here: string;
}

export interface IChatWordOptions {
  character_misplaced_tile_color: string;
  character_misplaced_color: string;
  character_correct_tile_color: string;
  character_correct_color: string;
  character_wrong_tile_color: string;
  character_wrong_color: string;
  chat_won_game_title: string;
  chat_won_game_message: string;
  chat_lost_game_title: string;
  chat_lost_game_message: string;
  chat_turn_message: string;
  chat_wrong_word_chosen: string;
  chat_response_invalid: string;
  game_ended_message_duration: number;
}

interface IGameWidgetState extends IWidgetCommonState {
  data: {
    settings: {
      decision_poll_timer: number;
      trigger_command: string;
      current_game: TGameType;
      no_input_received_message: string;
      restarting_game_message: string;
      available_games: TGameType[];
      game_options: {
        'tic-tac-toe': ITicTacToeOptions;
        'chat-word': IChatWordOptions;
      };
    };
  };
}

type TGameOptions = ITicTacToeOptions & IChatWordOptions;

function gameOption(key: string) {
  const optionTable = {
    'tic-tac-toe': $t('Tic Tac Toe'),
    'chat-word': $t('Chat Word'),
  };

  return { label: optionTable[key], value: key };
}

export function GameWidget() {
  const { isLoading, bind, selectedTab, setSelectedTab, settings } = useGameWidget();

  const availableGames = settings.available_games?.map(gameOption);

  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="general">{$t('General Settings')}</Menu.Item>
        <Menu.Item key="game">{$t('Game Settings')}</Menu.Item>
      </Menu>
      <Form>
        {!isLoading && selectedTab === 'general' && (
          <>
            <ListInput label={$t('Current Game')} {...bind.current_game} options={availableGames} />
            <SliderInput
              label={$t('Chat Decision Time')}
              tooltip={{
                title: $t(
                  "The duration in seconds to collect chat's responses before passing them to the game",
                ),
                placement: 'bottom',
              }}
              {...bind.decision_poll_timer}
              {...metadata.seconds({ min: 3000, max: 15000 })}
            />
            <TextInput
              label={$t('Trigger Command')}
              tooltip={$t('Command used by the chat to provide their response')}
              {...bind.trigger_command}
            />
            <TextInput
              label={$t('No Input Recieved')}
              tooltip={$t("Message displayed to let the chat know they didn't provide any input")}
              {...bind.no_input_received_message}
            />
            <TextInput
              label={$t('Restarting Game')}
              tooltip={$t('Message displayed to let the chat know the game is restarting')}
              {...bind.restarting_game_message}
            />
          </>
        )}
        {!isLoading && selectedTab === 'game' && <GameOptions game={settings.current_game} />}
      </Form>
    </WidgetLayout>
  );
}

export class GameWidgetModule extends WidgetModule<IGameWidgetState> {}

function useGameWidget() {
  return useWidget<GameWidgetModule>();
}

function GameOptions(p: { game: TGameType }) {
  const { settings, updateSettings } = useGameWidget();
  function updateGameOption(key: keyof ITicTacToeOptions) {
    return (value: unknown) => {
      updateSettings({ game_options: { [p.game]: { [key]: value } } });
    };
  }

  const GameSettings = componentMap[p.game];

  return (
    <GameSettings
      gameSettings={settings.game_options[p.game] as TGameOptions}
      updateGameOption={updateGameOption}
    />
  );
}
