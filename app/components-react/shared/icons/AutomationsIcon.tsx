import React from 'react';
import SvgContainer from 'components-react/shared/SvgContainer';

export default function AutomationsIcon(p: { className?: string; style?: React.CSSProperties }) {
  return <SvgContainer src={automationsSvg} className={p.className} style={p.style} />;
}

const automationsSvg = `
<svg width="187" height="184" viewBox="0 0 187 184" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g clip-path="url(#clip0_11144_15771)">
    <mask
      id="mask0_11144_15771"
      style="mask-type:luminance"
      maskUnits="userSpaceOnUse"
      x="-22"
      y="-26"
      width="256"
      height="256"
    >
      <path d="M234 -26H-22V230H234V-26Z" fill="white" />
      <path
        d="M143 102C175.033 102 201 76.0325 201 44C201 11.9675 175.033 -14 143 -14C110.967 -14 85 11.9675 85 44C85 76.0325 110.967 102 143 102Z"
        fill="black"
      />
    </mask>
    <g mask="url(#mask0_11144_15771)">
      <path
        d="M82.0415 19.999C84.6917 19.999 87.1294 21.5386 88.2407 23.9735L88.1985 24.0146L110.892 73.149L160.027 95.8216C162.461 96.9316 163.998 99.3735 164 102.02C164 104.67 162.463 107.107 160.027 108.219L110.892 130.912L88.1985 180.045C87.0851 182.476 84.6474 183.999 82.0004 183.999C79.3548 183.999 76.9136 182.476 75.8021 180.045L53.1087 130.912L3.97448 108.219C1.53893 107.107 0 104.67 0 102.02C0.0021087 99.3735 1.53872 96.933 4.0156 95.7804L53.15 73.1077L75.8432 23.9735C76.9534 21.5401 79.3945 20.0013 82.0415 19.999Z"
        fill="#91979A"
      />
    </g>
    <mask
      id="mask1_11144_15771"
      style="mask-type:luminance"
      maskUnits="userSpaceOnUse"
      x="-22"
      y="-26"
      width="256"
      height="256"
    >
      <path d="M234 -26H-22V230H234V-26Z" fill="white" />
      <path
        d="M139.6 26.7225C133.867 23.3225 131 24.9559 131 31.6225V55.6225C131 62.2892 133.867 63.9225 139.6 60.5225L159.4 48.7225C165.133 45.3225 165.133 41.9225 159.4 38.5225L139.6 26.7225Z"
        fill="black"
      />
    </mask>
    <g mask="url(#mask1_11144_15771)">
      <path
        d="M143 88C167.301 88 187 68.3005 187 44C187 19.6995 167.301 0 143 0C118.699 0 99 19.6995 99 44C99 68.3005 118.699 88 143 88Z"
        fill="#91979A"
      />
    </g>
  </g>
  <defs>
    <clipPath id="clip0_11144_15771">
      <rect width="187" height="184" fill="white" />
    </clipPath>
  </defs>
</svg>
`;
