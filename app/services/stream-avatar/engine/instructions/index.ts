import FortniteInstructions from "./fortnite";
import PubgInstructions from "./pubg";
import ValorantInstructions from "./valorant";
import CounterStrike2Instructions from "./counterstrike2";
import WarzoneInstructions from "./warzone";
import ArcRaidersInstructions from "./arcraiders";
import BlackOps6Instructions from "./blackops6";
import RocketLeagueInstructions from "./rocketleague";
import MinecraftInstructions from "./minecraft";
import ApexLegendsInstructions from "./apexlegends";
import Battlefield6Instructions from "./battlefield6";
import DeadByDaylightInstructions from "./deadbydaylight";
import DeadlockInstructions from "./deadlock";
import Dota2Instructions from "./dota2";
import LeagueOfLegendsInstructions from "./leagueoflegends";
import MarvelRivalsInstructions from "./marvelrivals";
import Overwatch2Instructions from "./overwatch2";
import RainbowSixSiegeInstructions from "./rainbowsixsiege";
import WarThunderInstructions from "./warthunder";
import MarathonInstructions from "./marathon";
import F125Instructions from "./f125";
import EaSportsFc26Instructions from "./easportsfc26";
import Nba2k26Instructions from "./nba2k26";
import ForzaHorizon6Instructions from "./forzahorizon6";
import EnshroudedInstructions from "./enshrouded";

export const Instructions = {
  ...FortniteInstructions,
  ...PubgInstructions,
  ...ValorantInstructions,
  ...CounterStrike2Instructions,
  ...WarzoneInstructions,
  ...ArcRaidersInstructions,
  ...BlackOps6Instructions,
  ...RocketLeagueInstructions,
  ...MinecraftInstructions,
  ...ApexLegendsInstructions,
  ...Battlefield6Instructions,
  ...DeadByDaylightInstructions,
  ...DeadlockInstructions,
  ...Dota2Instructions,
  ...LeagueOfLegendsInstructions,
  ...MarvelRivalsInstructions,
  ...Overwatch2Instructions,
  ...RainbowSixSiegeInstructions,
  ...WarThunderInstructions,
  ...MarathonInstructions,
  ...F125Instructions,
  ...EaSportsFc26Instructions,
  ...Nba2k26Instructions,
  ...ForzaHorizon6Instructions,
  ...EnshroudedInstructions,
} as const;

export type InstructionType = keyof typeof Instructions;
export type TInstruction = InstructionType;
