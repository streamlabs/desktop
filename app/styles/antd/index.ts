import antdNightTheme from './night-theme.lazy.less';
import antdDayTheme from './day-theme.lazy.less';
import antdPrimeDark from './prime-dark.lazy.less';
import antdPrimeLight from './prime-light.lazy.less';

const themes = {
  ['night-theme']: antdNightTheme,
  ['day-theme']: antdDayTheme,
  ['prime-dark']: antdPrimeDark,
  ['prime-light']: antdPrimeLight,
};

export type Theme = keyof typeof themes;

export default themes;
