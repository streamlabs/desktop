import type { PropertyInstance } from '../properties';
import type { GameState } from '../game-state';
import FortniteConditions, { FortniteConditionPropsMap } from './fortnite';
import PubgConditions, { PubgConditionPropsMap } from './pubg';
import ValorantConditions, { ValorantConditionPropsMap } from './valorant';
import CounterStrike2Conditions, { CounterStrike2ConditionPropsMap } from './counterstrike2';
import WarzoneConditions, { WarzoneConditionPropsMap } from './warzone';
import ArcRaidersConditions, { ArcRaidersConditionPropsMap } from './arcraiders';
import BlackOps6Conditions, { BlackOps6ConditionPropsMap } from './blackops6';
import RocketLeagueConditions, { RocketLeagueConditionPropsMap } from './rocketleague';
import MinecraftConditions, { MinecraftConditionPropsMap } from './minecraft';
import ApexLegendsConditions, { ApexLegendsConditionPropsMap } from './apexlegends';
import Battlefield6Conditions, { Battlefield6ConditionPropsMap } from './battlefield6';
import DeadByDaylightConditions, { DeadByDaylightConditionPropsMap } from './deadbydaylight';
import DeadlockConditions, { DeadlockConditionPropsMap } from './deadlock';
import Dota2Conditions, { Dota2ConditionPropsMap } from './dota2';
import LeagueOfLegendsConditions, { LeagueOfLegendsConditionPropsMap } from './leagueoflegends';
import MarvelRivalsConditions, { MarvelRivalsConditionPropsMap } from './marvelrivals';
import Overwatch2Conditions, { Overwatch2ConditionPropsMap } from './overwatch2';
import RainbowSixSiegeConditions, { RainbowSixSiegeConditionPropsMap } from './rainbowsixsiege';
import WarThunderConditions, { WarThunderConditionPropsMap } from './warthunder';
import MarathonConditions, { MarathonConditionPropsMap } from './marathon';
import F125Conditions, { F125ConditionPropsMap } from './f125';
import EaSportsFc26Conditions, { EaSportsFc26ConditionPropsMap } from './easportsfc26';
import Nba2k26Conditions, { Nba2k26ConditionPropsMap } from './nba2k26';
import ForzaHorizon6Conditions, { ForzaHorizon6ConditionPropsMap } from './forzahorizon6';
import EnshroudedConditions, { EnshroudedConditionPropsMap } from './enshrouded';

export type TEvaluatedCondition<T extends TCondition = TCondition> = {
  condition: T;
  status: boolean;
};

export type ConditionPropsMap = FortniteConditionPropsMap &
  PubgConditionPropsMap &
  ValorantConditionPropsMap &
  CounterStrike2ConditionPropsMap &
  WarzoneConditionPropsMap &
  ArcRaidersConditionPropsMap &
  BlackOps6ConditionPropsMap &
  RocketLeagueConditionPropsMap &
  MinecraftConditionPropsMap &
  ApexLegendsConditionPropsMap &
  Battlefield6ConditionPropsMap &
  DeadByDaylightConditionPropsMap &
  DeadlockConditionPropsMap &
  Dota2ConditionPropsMap &
  LeagueOfLegendsConditionPropsMap &
  MarvelRivalsConditionPropsMap &
  Overwatch2ConditionPropsMap &
  RainbowSixSiegeConditionPropsMap &
  WarThunderConditionPropsMap &
  MarathonConditionPropsMap &
  F125ConditionPropsMap &
  EaSportsFc26ConditionPropsMap &
  Nba2k26ConditionPropsMap &
  ForzaHorizon6ConditionPropsMap &
  EnshroudedConditionPropsMap;

export type ConditionType =
  | keyof FortniteConditionPropsMap
  | keyof PubgConditionPropsMap
  | keyof ValorantConditionPropsMap
  | keyof CounterStrike2ConditionPropsMap
  | keyof WarzoneConditionPropsMap
  | keyof ArcRaidersConditionPropsMap
  | keyof BlackOps6ConditionPropsMap
  | keyof RocketLeagueConditionPropsMap
  | keyof MinecraftConditionPropsMap
  | keyof ApexLegendsConditionPropsMap
  | keyof Battlefield6ConditionPropsMap
  | keyof DeadByDaylightConditionPropsMap
  | keyof DeadlockConditionPropsMap
  | keyof Dota2ConditionPropsMap
  | keyof LeagueOfLegendsConditionPropsMap
  | keyof MarvelRivalsConditionPropsMap
  | keyof Overwatch2ConditionPropsMap
  | keyof RainbowSixSiegeConditionPropsMap
  | keyof WarThunderConditionPropsMap
  | keyof MarathonConditionPropsMap
  | keyof F125ConditionPropsMap
  | keyof EaSportsFc26ConditionPropsMap
  | keyof Nba2k26ConditionPropsMap
  | keyof ForzaHorizon6ConditionPropsMap
  | keyof EnshroudedConditionPropsMap;

export type ConditionProps<T extends ConditionType> = ConditionPropsMap[T];

export type ConditionDefinition<K extends ConditionType> = {
  group: string;
  name: string;
  label: string;
  disabled?: boolean;
  properties?: Record<string, PropertyInstance>;
  evaluate: (args: {
    state: GameState;
    prevState: GameState;
    props: ConditionPropsMap[K];
  }) => boolean;
};

const perGameConditions = {
  ...FortniteConditions,
  ...PubgConditions,
  ...ValorantConditions,
  ...CounterStrike2Conditions,
  ...WarzoneConditions,
  ...ArcRaidersConditions,
  ...BlackOps6Conditions,
  ...RocketLeagueConditions,
  ...MinecraftConditions,
  ...ApexLegendsConditions,
  ...Battlefield6Conditions,
  ...DeadByDaylightConditions,
  ...DeadlockConditions,
  ...Dota2Conditions,
  ...LeagueOfLegendsConditions,
  ...MarvelRivalsConditions,
  ...Overwatch2Conditions,
  ...RainbowSixSiegeConditions,
  ...WarThunderConditions,
  ...MarathonConditions,
  ...F125Conditions,
  ...EaSportsFc26Conditions,
  ...Nba2k26Conditions,
  ...ForzaHorizon6Conditions,
  ...EnshroudedConditions,
} as const;

export const Conditions: { [K in ConditionType]: ConditionDefinition<K> } = perGameConditions;

export const GAME_NAMES: Record<string, string> = {
  fortnite: 'Fortnite',
  pubg: 'PUBG: Battlegrounds',
  valorant: 'Valorant',
  counter_strike_2: 'Counter-Strike 2',
  black_ops_6: 'Call of Duty: Black Ops 6',
  warzone: 'Call of Duty: Warzone',
  rocket_league: 'Rocket League',
  arc_raiders: 'Arc Raiders',
  minecraft: 'Minecraft',
  apex_legends: 'Apex Legends',
  battlefield_6: 'Battlefield 6',
  dead_by_daylight: 'Dead by Daylight',
  deadlock: 'Deadlock',
  dota_2: 'Dota 2',
  league_of_legends: 'League of Legends',
  marvel_rivals: 'Marvel Rivals',
  overwatch_2: 'Overwatch 2',
  rainbow_six_siege: 'Rainbow Six Siege',
  war_thunder: 'War Thunder',
  marathon: 'Marathon',
  f1_25: 'F1 25',
  ea_sports_fc_26: 'EA Sports FC 26',
  nba_2k26: 'NBA 2K26',
  forza_horizon_6: 'Forza Horizon 6',
  enshrouded: 'Enshrouded',
};

export type TCondition<T extends ConditionType = ConditionType> = {
  type: T;
  props?: ConditionProps<T>;
};

export class ConditionsManager {
  static evaluate({
    condition,
    state,
    prevState,
  }: {
    condition: TCondition;
    state: GameState;
    prevState: GameState;
  }) {
    const def = Conditions[condition.type];
    if (!def) {
      throw new Error(`Condition type "${condition.type}" not found`);
    }

    const evaluateFn = (def as ConditionDefinition<typeof condition.type>).evaluate;
    return evaluateFn({
      state,
      prevState,
      props: condition.props as ConditionProps<typeof condition.type>,
    });
  }
}
