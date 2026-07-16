import antdNightTheme from './night-theme.lazy.less';
import antdDayTheme from './day-theme.lazy.less';
import antdPrimeDark from './prime-dark.lazy.less';
import antdPrimeLight from './prime-light.lazy.less';
import antdGoLiveNightTheme from './golive-night-theme.lazy.less';
import antdGoLiveDayTheme from './golive-day-theme.lazy.less';
import antdGoLivePrimeDark from './golive-prime-dark.lazy.less';
import antdGoLivePrimeLight from './golive-prime-light.lazy.less';

const themes = {
  ['night-theme']: antdNightTheme,
  ['day-theme']: antdDayTheme,
  ['prime-dark']: antdPrimeDark,
  ['prime-light']: antdPrimeLight,
  ['golive-night-theme']: antdGoLiveNightTheme,
  ['golive-day-theme']: antdGoLiveDayTheme,
  ['golive-prime-dark']: antdGoLivePrimeDark,
  ['golive-prime-light']: antdGoLivePrimeLight,
};

export type Theme = keyof typeof themes;

export default themes;
