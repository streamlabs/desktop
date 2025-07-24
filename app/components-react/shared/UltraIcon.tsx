import React, { CSSProperties } from 'react';
import { Services } from '../service-provider';
import { useVuex } from 'components-react/hooks';
import cx from 'classnames';
import { useRealmObject } from 'components-react/hooks/realm';

type TUltraIcon = 'badge' | 'day' | 'night' | 'simple';

interface IUltraIcon {
  type?: TUltraIcon | string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The ultra icon has been added as a font but use this svg icon component
 * when displaying the icon with multicolor styling.
 */
export default function UltraIcon({ type, className, style }: IUltraIcon) {
  const isDarkTheme = useRealmObject(Services.CustomizationService.state).isDarkTheme;

  if (type === 'day' || (!type && !isDarkTheme)) {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cx('ultra-icon', 'ultra-icon-day', className)}
        style={style}
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M13.2921 3.24162C12.9099 2.66674 12.134 2.51058 11.5591 2.89282C10.9842 3.27507 10.828 4.05096 11.2103 4.62584C11.71 5.37741 12.0012 6.27854 12.0012 7.25147C12.0012 9.87468 9.87468 12.0012 7.25147 12.0012C6.27854 12.0012 5.37741 11.71 4.62584 11.2103C4.05096 10.828 3.27507 10.9842 2.89282 11.5591C2.51058 12.134 2.66674 12.9099 3.24162 13.2921C4.39061 14.0561 5.77096 14.5012 7.25147 14.5012C11.2554 14.5012 14.5012 11.2554 14.5012 7.25147C14.5012 5.77096 14.0561 4.39061 13.2921 3.24162ZM7.25 9.25C8.35457 9.25 9.25 8.35457 9.25 7.25C9.25 6.14543 8.35457 5.25 7.25 5.25C6.14543 5.25 5.25 6.14543 5.25 7.25C5.25 8.35457 6.14543 9.25 7.25 9.25Z"
          fill="url(#paint0_linear_1_5)"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.24974 2.5C4.62653 2.5 2.5 4.62653 2.5 7.24974C2.5 7.9401 1.94036 8.49974 1.25 8.49974C0.559644 8.49974 0 7.9401 0 7.24974C0 3.24582 3.24582 0 7.24974 0C7.9401 0 8.49974 0.559644 8.49974 1.25C8.49974 1.94036 7.9401 2.5 7.24974 2.5Z"
          fill="#09161D"
        />
        <defs>
          <linearGradient
            id="paint0_linear_1_5"
            x1="4.41781"
            y1="7.64438"
            x2="14.1296"
            y2="14.0801"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#2DE8B0" />
            <stop offset="0.488027" stopColor="#CBE953" />
            <stop offset="0.758621" stopColor="#FFAB48" />
            <stop offset="1" stopColor="#FF5151" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (type === 'night' || (!type && isDarkTheme)) {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cx('ultra-icon', 'ultra-icon-night', className)}
        style={style}
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M13.2921 3.24162C12.9099 2.66674 12.134 2.51058 11.5591 2.89282C10.9842 3.27507 10.828 4.05096 11.2103 4.62584C11.71 5.37741 12.0012 6.27854 12.0012 7.25147C12.0012 9.87468 9.87468 12.0012 7.25147 12.0012C6.27854 12.0012 5.37741 11.71 4.62584 11.2103C4.05096 10.828 3.27507 10.9842 2.89282 11.5591C2.51058 12.134 2.66674 12.9099 3.24162 13.2921C4.39061 14.0561 5.77096 14.5012 7.25147 14.5012C11.2554 14.5012 14.5012 11.2554 14.5012 7.25147C14.5012 5.77096 14.0561 4.39061 13.2921 3.24162ZM7.25 9.25C8.35457 9.25 9.25 8.35457 9.25 7.25C9.25 6.14543 8.35457 5.25 7.25 5.25C6.14543 5.25 5.25 6.14543 5.25 7.25C5.25 8.35457 6.14543 9.25 7.25 9.25Z"
          fill="url(#paint0_linear_0_1)"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.24974 2.5C4.62653 2.5 2.5 4.62653 2.5 7.24974C2.5 7.9401 1.94036 8.49974 1.25 8.49974C0.559644 8.49974 0 7.9401 0 7.24974C0 3.24582 3.24582 0 7.24974 0C7.9401 0 8.49974 0.559644 8.49974 1.25C8.49974 1.94036 7.9401 2.5 7.24974 2.5Z"
          fill="white"
        />
        <defs>
          <linearGradient
            id="paint0_linear_0_1"
            x1="4.41781"
            y1="7.64438"
            x2="14.1296"
            y2="14.0801"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#2DE8B0" />
            <stop offset="0.488027" stopColor="#CBE953" />
            <stop offset="0.758621" stopColor="#FFAB48" />
            <stop offset="1" stopColor="#FF5151" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (type === 'simple') {
    return (
      <i
        className={cx('icon-ultra', className)}
        style={style ?? { fontSize: '12px', color: 'var(--black)' }}
      />
    );
  }

  // return night icon by default
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx('ultra-icon', className)}
      style={style}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.2921 3.24162C12.9099 2.66674 12.134 2.51058 11.5591 2.89282C10.9842 3.27507 10.828 4.05096 11.2103 4.62584C11.71 5.37741 12.0012 6.27854 12.0012 7.25147C12.0012 9.87468 9.87468 12.0012 7.25147 12.0012C6.27854 12.0012 5.37741 11.71 4.62584 11.2103C4.05096 10.828 3.27507 10.9842 2.89282 11.5591C2.51058 12.134 2.66674 12.9099 3.24162 13.2921C4.39061 14.0561 5.77096 14.5012 7.25147 14.5012C11.2554 14.5012 14.5012 11.2554 14.5012 7.25147C14.5012 5.77096 14.0561 4.39061 13.2921 3.24162ZM7.25 9.25C8.35457 9.25 9.25 8.35457 9.25 7.25C9.25 6.14543 8.35457 5.25 7.25 5.25C6.14543 5.25 5.25 6.14543 5.25 7.25C5.25 8.35457 6.14543 9.25 7.25 9.25Z"
        fill="url(#paint0_linear_1_5)"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.24974 2.5C4.62653 2.5 2.5 4.62653 2.5 7.24974C2.5 7.9401 1.94036 8.49974 1.25 8.49974C0.559644 8.49974 0 7.9401 0 7.24974C0 3.24582 3.24582 0 7.24974 0C7.9401 0 8.49974 0.559644 8.49974 1.25C8.49974 1.94036 7.9401 2.5 7.24974 2.5Z"
        fill="#09161D"
      />
      <defs>
        <linearGradient
          id="paint0_linear_1_5"
          x1="4.41781"
          y1="7.64438"
          x2="14.1296"
          y2="14.0801"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2DE8B0" />
          <stop offset="0.488027" stopColor="#CBE953" />
          <stop offset="0.758621" stopColor="#FFAB48" />
          <stop offset="1" stopColor="#FF5151" />
        </linearGradient>
      </defs>
    </svg>
  );
}
