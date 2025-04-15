import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';
import SvgContainer from 'components-react/shared/SvgContainer';
import React from 'react';
import {
  TTransitionType,
  IAvailableTransition,
} from 'services/highlighter/models/rendering.models';

export default function TransitionSelector() {
  const { HighlighterService } = Services;
  const v = useVuex(() => ({
    transitionType: HighlighterService.views.transition.type,
  }));

  function getTransitionBlock(transition: IAvailableTransition) {
    const isActive = v.transitionType === transition.type;

    return (
      <div
        style={{ textAlign: 'center', fontSize: 11, cursor: 'pointer' }}
        onClick={() => HighlighterService.actions.setTransition({ type: transition.type })}
        key={transition.type}
      >
        <div
          style={{
            width: 52,
            height: 52,
            background: 'var(--background)',
            borderRadius: 8,
            border: isActive ? '2px solid var(--teal)' : undefined,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TransitionIcon type={transition.type} />
        </div>
        <div
          style={{
            margin: '4px 0 8px',
            color: isActive ? 'var(--teal)' : undefined,
            fontWeight: isActive ? 600 : undefined,
          }}
        >
          {transition.displayName}
        </div>
      </div>
    );
  }

  return (
    <InputWrapper label="Transition Type">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {HighlighterService.views.availableTransitions.map(t => {
          return getTransitionBlock(t);
        })}
      </div>
    </InputWrapper>
  );
}

// Icons
const TransitionIcon = (p: { type: TTransitionType }) => {
  if (p.type === 'None') return <div></div>;

  const iconSrc = {
    Random: randomIcon,
    fade: fadeIcon,
    Directional: slideIcon,
    cube: cubeIcon,
    crosswarp: warpIcon,
    wind: windIcon,
    DoomScreenTransition: doomIcon,
    GridFlip: gridIcon,
    Dreamy: dreamyIcon,
    SimpleZoom: zoomIcon,
    pixelize: pixelizeIcon,
  }[p.type];

  return <SvgContainer src={iconSrc} style={{ width: 36 }} />;
};

const randomIcon = `
<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip1)">
<path d="M26.3717 17.8141C27.4644 16.7163 28.833 15.9336 30.3332 15.5483V4.33333C30.3332 3.18406 29.8766 2.08186 29.064 1.2692C28.2513 0.456546 27.1491 0 25.9998 0L6.49984 0C5.35057 0 4.24837 0.456546 3.43571 1.2692C2.62305 2.08186 2.1665 3.18406 2.1665 4.33333V23.8333C2.1665 24.9826 2.62305 26.0848 3.43571 26.8975C4.24837 27.7101 5.35057 28.1667 6.49984 28.1667H16.0191L26.3717 17.8141ZM21.6665 6.5C22.095 6.5 22.5139 6.62707 22.8702 6.86515C23.2265 7.10323 23.5043 7.44161 23.6682 7.83752C23.8322 8.23343 23.8751 8.66907 23.7915 9.08936C23.7079 9.50965 23.5016 9.89572 23.1986 10.1987C22.8956 10.5017 22.5095 10.7081 22.0892 10.7917C21.6689 10.8753 21.2333 10.8324 20.8374 10.6684C20.4415 10.5044 20.1031 10.2267 19.865 9.8704C19.6269 9.5141 19.4998 9.09519 19.4998 8.66667C19.4998 8.09203 19.7281 7.54093 20.1344 7.1346C20.5408 6.72827 21.0919 6.5 21.6665 6.5ZM21.6665 15.1667C22.095 15.1667 22.5139 15.2937 22.8702 15.5318C23.2265 15.7699 23.5043 16.1083 23.6682 16.5042C23.8322 16.9001 23.8751 17.3357 23.7915 17.756C23.7079 18.1763 23.5016 18.5624 23.1986 18.8654C22.8956 19.1684 22.5095 19.3748 22.0892 19.4584C21.6689 19.542 21.2333 19.4991 20.8374 19.3351C20.4415 19.1711 20.1031 18.8934 19.865 18.5371C19.6269 18.1808 19.4998 17.7619 19.4998 17.3333C19.4998 16.7587 19.7281 16.2076 20.1344 15.8013C20.5408 15.3949 21.0919 15.1667 21.6665 15.1667ZM10.8332 6.5C11.2617 6.5 11.6806 6.62707 12.0369 6.86515C12.3932 7.10323 12.6709 7.44161 12.8349 7.83752C12.9989 8.23343 13.0418 8.66907 12.9582 9.08936C12.8746 9.50965 12.6682 9.89572 12.3652 10.1987C12.0622 10.5017 11.6762 10.7081 11.2559 10.7917C10.8356 10.8753 10.3999 10.8324 10.004 10.6684C9.60812 10.5044 9.26973 10.2267 9.03165 9.8704C8.79358 9.5141 8.6665 9.09519 8.6665 8.66667C8.6665 8.09203 8.89478 7.54093 9.30111 7.1346C9.70744 6.72827 10.2585 6.5 10.8332 6.5ZM10.8332 21.6667C10.4046 21.6667 9.98574 21.5396 9.62944 21.3015C9.27313 21.0634 8.99542 20.7251 8.83143 20.3291C8.66744 19.9332 8.62453 19.4976 8.70814 19.0773C8.79174 18.657 8.99809 18.271 9.30111 17.9679C9.60412 17.6649 9.99018 17.4586 10.4105 17.375C10.8308 17.2914 11.2664 17.3343 11.6623 17.4983C12.0582 17.6623 12.3966 17.94 12.6347 18.2963C12.8728 18.6526 12.9998 19.0715 12.9998 19.5C12.9998 20.0746 12.7716 20.6257 12.3652 21.0321C11.9589 21.4384 11.4078 21.6667 10.8332 21.6667Z" fill="#91979A"/>
<path d="M47.8204 30.0708L36.7335 18.9837C36.3669 18.6159 35.9371 18.3171 35.4647 18.1016C32.7209 16.8577 29.8194 17.4302 27.9038 19.3474L16.8167 30.4332C16.4489 30.7998 16.1501 31.2296 15.9346 31.702C14.6907 34.4459 15.2632 37.3473 17.1804 39.2629L28.2673 50.35C28.6339 50.7178 29.0637 51.0166 29.5361 51.2321C32.2799 52.476 35.1814 51.9035 37.097 49.9863L48.1841 38.8994C48.5519 38.5329 48.8507 38.103 49.0662 37.6306C50.309 34.8878 49.7365 31.9856 47.8204 30.0708ZM32.4999 36.8335C32.0713 36.8335 31.6524 36.7064 31.2961 36.4684C30.9398 36.2303 30.6621 35.8919 30.4981 35.496C30.3341 35.1001 30.2912 34.6644 30.3748 34.2442C30.4584 33.8239 30.6648 33.4378 30.9678 33.1348C31.2708 32.8318 31.6569 32.6254 32.0772 32.5418C32.4975 32.4582 32.9331 32.5011 33.329 32.6651C33.7249 32.8291 34.0633 33.1068 34.3014 33.4631C34.5395 33.8194 34.6665 34.2383 34.6665 34.6669C34.6665 35.2415 34.4383 35.7926 34.0319 36.1989C33.6256 36.6052 33.0745 36.8335 32.4999 36.8335Z" fill="#C3C7CA"/>
</g>
<defs>
<clipPath id="clip1">
<rect width="52" height="52" fill="white"/>
</clipPath>
</defs>
</svg>`;

const fadeIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect opacity="0.8" x="10" y="10" width="42" height="42" rx="1" fill="#91979A"/>
<rect opacity="0.5" width="42" height="42" rx="1" fill="#91979A"/>
</svg>`;

const slideIcon = `<svg width="53" height="53" viewBox="0 0 53 53" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect opacity="0.5" x="0.792236" y="0.0390625" width="52" height="51.9999" rx="1" fill="#91979A"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M11.9696 20.2891C12.3044 20.6239 12.3044 21.1666 11.9696 21.5013L7.43285 26.0381L11.9696 30.5748C12.3044 30.9096 12.3044 31.4523 11.9696 31.787C11.6349 32.1217 11.0922 32.1217 10.7574 31.787L5.61458 26.6442C5.27984 26.3094 5.27984 25.7667 5.61458 25.432L10.7574 20.2891C11.0922 19.9544 11.6349 19.9544 11.9696 20.2891Z" fill="#91979A"/>
<rect x="16.7922" y="0.0390625" width="36" height="51.9999" rx="1" fill="#91979A"/>
</svg>`;

const cubeIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0.5 43.8296V9.53898L33.5476 1.63371V51.373L0.5 43.8296Z" fill="#C3C7CA" stroke="#91979A" stroke-linecap="round"/>
<path d="M33.5479 50.84V1.90457L50.5002 12.5541V40.8114L33.5479 50.84Z" fill="#C3C7CA" stroke="#91979A" stroke-linecap="round"/>
</svg>`;

const warpIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="52" height="52" rx="1" fill="url(#paint0_linear)"/>
<defs>
<linearGradient id="paint0_linear" x1="52" y1="26" x2="-4.47046e-08" y2="26" gradientUnits="userSpaceOnUse">
<stop stop-color="#91979A"/>
<stop offset="1" stop-color="#91979A" stop-opacity="0"/>
</linearGradient>
</defs>
</svg>`;

const windIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="mask0" mask-type="alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="52" height="52">
<rect x="52" y="52" width="52" height="52" rx="1" transform="rotate(180 52 52)" fill="#C3C7CA"/>
</mask>
<g mask="url(#mask0)">
<rect x="40" y="26" width="40" height="1" transform="rotate(180 40 26)" fill="#959B9E"/>
<rect x="40" y="52" width="40" height="1" transform="rotate(180 40 52)" fill="#959B9E"/>
<rect x="17" y="22" width="17" height="1" transform="rotate(180 17 22)" fill="#959B9E"/>
<rect x="17" y="48" width="17" height="1" transform="rotate(180 17 48)" fill="#959B9E"/>
<rect x="44" y="20" width="44" height="1" transform="rotate(180 44 20)" fill="#959B9E"/>
<rect x="34" y="46" width="34" height="1" transform="rotate(180 34 46)" fill="#959B9E"/>
<rect x="42" y="18" width="42" height="1" transform="rotate(180 42 18)" fill="#959B9E"/>
<rect x="40" y="44" width="40" height="1" transform="rotate(180 40 44)" fill="#959B9E"/>
<rect x="38" y="16" width="38" height="1" transform="rotate(180 38 16)" fill="#959B9E"/>
<rect x="38" y="42" width="38" height="1" transform="rotate(180 38 42)" fill="#959B9E"/>
<rect x="31" y="14" width="31" height="1" transform="rotate(180 31 14)" fill="#959B9E"/>
<rect x="31" y="40" width="31" height="1" transform="rotate(180 31 40)" fill="#959B9E"/>
<rect x="37" y="12" width="37" height="1" transform="rotate(180 37 12)" fill="#959B9E"/>
<rect x="37" y="38" width="37" height="1" transform="rotate(180 37 38)" fill="#959B9E"/>
<rect x="45" y="10" width="45" height="1" transform="rotate(180 45 10)" fill="#959B9E"/>
<rect x="43" y="36" width="43" height="1" transform="rotate(180 43 36)" fill="#959B9E"/>
<rect x="57" y="8" width="57" height="1" transform="rotate(180 57 8)" fill="#959B9E"/>
<rect x="57" y="34" width="57" height="1" transform="rotate(180 57 34)" fill="#959B9E"/>
<rect x="46" y="6" width="46" height="1" transform="rotate(180 46 6)" fill="#959B9E"/>
<rect x="46" y="32" width="46" height="1" transform="rotate(180 46 32)" fill="#959B9E"/>
<rect x="35" y="4" width="35" height="1" transform="rotate(180 35 4)" fill="#959B9E"/>
<rect x="35" y="30" width="35" height="1" transform="rotate(180 35 30)" fill="#959B9E"/>
<rect x="42" y="2" width="42" height="1" transform="rotate(180 42 2)" fill="#959B9E"/>
<rect x="42" y="28" width="42" height="1" transform="rotate(180 42 28)" fill="#959B9E"/>
<rect x="46" y="24" width="46" height="1" transform="rotate(180 46 24)" fill="#959B9E"/>
<rect x="28" y="50" width="28" height="1" transform="rotate(180 28 50)" fill="#959B9E"/>
</g>
</svg>`;

const doomIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect y="2" width="7" height="7" fill="#91979A"/>
<rect x="8" y="11" width="6" height="6" fill="#91979A"/>
<rect x="15" y="6" width="5" height="5" fill="#91979A"/>
<rect x="22" y="8" width="7" height="7" fill="#91979A"/>
<rect x="31" y="11" width="5" height="5" fill="#91979A"/>
<rect x="28" y="1" width="4" height="4" fill="#91979A"/>
<rect x="38" y="8" width="6" height="6" fill="#91979A"/>
<rect x="46" y="4" width="6" height="6" fill="#91979A"/>
<rect x="45" y="13" width="7" height="7" fill="#91979A"/>
<rect x="34" y="17" width="7" height="7" fill="#91979A"/>
<rect x="27" y="17" width="4" height="4" fill="#91979A"/>
<rect x="16" y="15" width="5" height="5" fill="#91979A"/>
<rect x="7" y="21" width="8" height="8" fill="#91979A"/>
<rect y="25" width="8" height="8" fill="#91979A"/>
<rect x="14" y="25" width="8" height="8" fill="#91979A"/>
<rect x="33" y="26" width="5" height="5" fill="#91979A"/>
<rect x="22" y="23" width="8" height="8" fill="#91979A"/>
<rect y="27" width="52" height="25" fill="#91979A"/>
<rect x="44" y="23" width="8" height="8" fill="#91979A"/>
<rect y="13" width="6" height="6" fill="#91979A"/>
</svg>`;

const gridIcon = `<svg width="52" height="50" viewBox="0 0 52 50" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="3" width="10" height="11" fill="#91979A"/>
<rect y="13" width="16" height="11" fill="#91979A"/>
<rect y="26" width="16" height="11" fill="#91979A"/>
<rect x="3" y="39" width="10" height="11" fill="#91979A"/>
<rect x="18" width="16" height="11" fill="#91979A"/>
<rect x="21" y="13" width="10" height="11" fill="#91979A"/>
<rect x="18" y="26" width="16" height="11" fill="#91979A"/>
<rect x="18" y="39" width="16" height="11" fill="#91979A"/>
<rect x="39" width="10" height="11" fill="#91979A"/>
<rect x="36" y="13" width="16" height="11" fill="#91979A"/>
<rect x="36" y="26" width="16" height="11" fill="#91979A"/>
<rect x="38" y="39" width="12" height="11" fill="#91979A"/>
</svg>`;

const dreamyIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="52" height="52" rx="1" fill="url(#paint0_linear)"/>
<mask id="mask0" mask-type="alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="52" height="52">
<rect width="52" height="52" rx="1" fill="#91979A"/>
</mask>
<g mask="url(#mask0)">
<path d="M-7.61035 21.7832C-6.84119 22.7985 -6.3137 23.7687 -5.16128 24.3788C-4.32549 24.8213 -3.28542 25.3808 -2.56568 25.9697C-0.00995255 28.0607 3.33896 29.1304 6.61311 29.1304C8.53597 29.1304 10.2054 29.2425 11.9927 28.4606C13.8189 27.6616 15.5879 26.5788 17.3514 25.6452C19.0235 24.76 21.4045 24.6091 23.2647 24.6091C24.7883 24.6091 26.3938 25.0833 27.6605 25.9278C29.8812 27.4083 32.3601 28.5794 34.7775 29.6537C35.4687 29.961 36.309 29.8685 37.0381 30.0305C37.6663 30.1701 38.3187 30.2608 38.9639 30.2608C40.2205 30.2608 41.532 30.3592 42.784 30.2503C44.459 30.1047 46.0721 29.6022 47.588 28.9525C48.9861 28.3533 50.239 27.4917 51.6384 26.8697C52.6438 26.4229 53.6333 25.8157 54.6526 25.3626C56.2282 24.6624 58.1899 24.3947 59.645 23.6671" stroke="#91979A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M-5 11.276C-4.09502 12.3729 -2.59033 13.6231 -1.1607 13.9198C2.31523 14.6412 5.95127 15.8067 9.54105 14.6785C10.3686 14.4184 11.2567 13.7884 11.9895 13.3221C13.1646 12.5743 14.435 11.9701 15.6448 11.276C18.1213 9.85508 20.3889 9 23.2545 9C26.736 9 29.3475 10.8571 32.1975 12.7243C35.9731 15.198 41.4863 14.6205 45.2787 12.7243" stroke="#91979A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M70.2788 42.8724C69.3738 41.7755 67.8691 40.5253 66.4395 40.2286C62.9636 39.5072 59.3275 38.3417 55.7378 39.47C54.9102 39.73 54.0221 40.36 53.2893 40.8264C52.1143 41.5741 50.8438 42.1783 49.634 42.8724C47.1575 44.2934 44.8899 45.1484 42.0243 45.1484C38.5428 45.1484 35.9313 43.2914 33.0813 41.4241C29.3057 38.9504 23.7925 39.5279 20.0001 41.4241" stroke="#91979A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<defs>
<linearGradient id="paint0_linear" x1="52.5" y1="25" x2="-3.91155e-07" y2="26" gradientUnits="userSpaceOnUse">
<stop stop-color="#91979A"/>
<stop offset="1" stop-color="#91979A" stop-opacity="0"/>
</linearGradient>
</defs>
</svg>`;

const zoomIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 0V52H52V0H0ZM14.825 42.9859V46.0328H5.92117V37.129H8.96805V40.8059L17.5477 32.258L19.6984 34.4166L11.0969 42.9859H14.825ZM17.5477 19.742L8.96805 11.1941V14.871H5.92117V5.96719H14.825V9.01407H11.0969L19.6984 17.5834L17.5477 19.742ZM46.0788 46.0328H37.175V42.9859H40.9031L32.3016 34.4166L34.4523 32.258L43.032 40.8059V37.129H46.0788V46.0328ZM46.0788 14.871H43.032V11.1941L34.4523 19.742L32.3016 17.5834L40.9031 9.01407H37.175V5.96719H46.0788V14.871Z" fill="#91979A"/>
</svg>`;

const pixelizeIcon = `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M17.5703 17.6719H26V26H17.5703V17.6719Z" fill="#91979A"/>
<path d="M26 26H34.3281V34.4297H26V26Z" fill="#91979A"/>
<path d="M45.8047 0H42.7578V6.19531H9.24219V0H6.19531V6.19531H0V9.24219H6.19531V42.7578H0V45.8047H6.19531V52H9.24219V45.8047H42.7578V52H45.8047V45.8047H52V42.7578H45.8047V9.24219H52V6.19531H45.8047V0ZM42.7578 17.6719H34.3281V26H42.7578V34.4297H34.3281V42.7578H26V34.4297H17.5703V42.7578H9.24219V34.4297H17.5703V26H9.24219V17.6719H17.5703V9.24219H26V17.6719H34.3281V9.24219H42.7578V17.6719Z" fill="#91979A"/>
</svg>`;
