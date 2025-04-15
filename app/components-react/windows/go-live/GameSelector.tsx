import React, { useEffect } from 'react';
import {
  getPlatformService,
  IGame,
  IPlatformCapabilityGame,
  TPlatform,
} from '../../../services/platforms';
import { ListInput, TSlobsInputProps } from '../../shared/inputs';
import { $t } from '../../../services/i18n';
import { IListOption } from '../../shared/inputs/ListInput';
import { Services } from '../../service-provider';
import { injectState, useModule } from 'slap';

type TProps = TSlobsInputProps<{ platform: TPlatform }, string>;

export default function GameSelector(p: TProps) {
  const { platform } = p;
  const platformService = (getPlatformService(platform) as unknown) as IPlatformCapabilityGame;
  const selectedGameId = platformService.state.settings.game;
  let selectedGameName = selectedGameId;

  const isTwitch = platform === 'twitch';
  const isTrovo = platform === 'trovo';
  const isTikTok = platform === 'tiktok';
  const isKick = platform === 'kick';

  if (isTrovo) {
    selectedGameName = Services.TrovoService.state.channelInfo.gameName;
  }

  if (isTikTok) {
    selectedGameName = Services.TikTokService.state.gameName;
  }

  if (isKick) {
    selectedGameName = Services.KickService.state.gameName;
  }

  const { isSearching, setIsSearching, games, setGames } = useModule(() => {
    const selectedGameOptions =
      isTikTok && selectedGameId.toLowerCase() !== Services.TikTokService.defaultGame.id
        ? [
            { label: selectedGameName, value: selectedGameId },
            {
              label: Services.TikTokService.defaultGame.name,
              value: Services.TikTokService.defaultGame.id,
            },
          ]
        : [{ label: selectedGameName, value: selectedGameId }];

    return {
      state: injectState({
        isSearching: false,
        games: selectedGameId ? selectedGameOptions : ([] as IListOption<string>[]),
      }),
    };
  });

  function fetchGames(query: string): Promise<IGame[]> {
    return platformService.searchGames(query);
  }

  useEffect(() => {
    loadImageForSelectedGame();
  }, []);

  async function loadImageForSelectedGame() {
    // game images available for Twitch, Trovo, and Kick only
    if (!['twitch', 'trovo', 'kick'].includes(platform)) return;
    if (!selectedGameName) return;
    const game = await platformService.fetchGame(selectedGameName);
    if (!game || game.name !== selectedGameName) return;
    setGames(
      games.map(opt => (opt.value === selectedGameId ? { ...opt, image: game.image } : opt)),
    );
  }

  async function onSearch(searchString: string) {
    if (searchString.length < 2 && platform !== 'tiktok') return;
    const games =
      (await fetchGames(searchString))?.map(g => ({
        value: ['trovo', 'tiktok', 'kick'].includes(platform) ? g.id : g.name,
        label: g.name,
        image: g?.image,
      })) ?? [];

    setGames(games);
    setIsSearching(false);
  }

  function onBeforeSearchHandler(searchString: string) {
    if (searchString.length < 2) return;
    setIsSearching(true);
  }

  function onSelect(searchString: string) {
    const game = games.find(game => game.label === searchString);

    if (isTikTok) {
      Services.TikTokService.actions.setGameName(searchString);
    }

    if (!game) return;
    setGames([game]);
  }

  const label = {
    twitch: $t('Twitch Category'),
    facebook: $t('Facebook Game'),
    trovo: $t('Trovo Category'),
    tiktok: $t('TikTok Category'),
    kick: $t('Kick Category'),
  }[platform as string];

  const filterOption = (input: string, option?: { label: string; value: string }) => {
    if (isTikTok) {
      return (
        option?.label === 'Other' ||
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      );
    }

    return (option?.label ?? '').toLowerCase().includes(input.toLowerCase());
  };

  return (
    <ListInput
      label={label}
      name={`${p.platform}Game`}
      value={selectedGameId}
      extra={p.extra}
      onChange={p.onChange}
      placeholder={$t('Start typing to search')}
      options={games}
      showSearch
      onSearch={onSearch}
      onSelect={(val, opts) => {
        onSelect(opts.labelrender);
      }}
      filterOption={filterOption}
      debounce={500}
      required={isTwitch || isTrovo || isKick}
      hasImage={isTwitch || isTrovo || isKick}
      onBeforeSearch={onBeforeSearchHandler}
      imageSize={platformService.gameImageSize}
      loading={isSearching}
      notFoundContent={isSearching ? $t('Searching...') : $t('No matching game(s) found.')}
      allowClear
    />
  );
}
