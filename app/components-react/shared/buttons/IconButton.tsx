import React from 'react';
import { Button, ButtonProps } from 'antd';
import { $t } from 'services/i18n/i18n';
import Tooltip from '../Tooltip';

interface IIconButtonProps extends ButtonProps {
  label: string;
  tooltipTitle?: string;
  tooltipPlacement?: 'top' | 'right' | 'bottom' | 'left';
  tooltipClassName?: string;
  autoAdjustOverflow?: boolean;
}

export default function IconButton({
  type = 'text',
  tooltipTitle,
  tooltipPlacement = 'right',
  ...p
}: IIconButtonProps) {
  const hasTooltip = !!tooltipTitle;

  return hasTooltip ? (
    <Tooltip
      placement={tooltipPlacement}
      title={tooltipTitle}
      className={p.tooltipClassName}
      autoAdjustOverflow={p.autoAdjustOverflow}
    >
      <Button type={type} icon={p.icon} aria-label={$t(p.label)} onClick={p.onClick} />
    </Tooltip>
  ) : (
    <Button type={type} icon={p.icon} aria-label={$t(p.label)} onClick={p.onClick} />
  );
}
