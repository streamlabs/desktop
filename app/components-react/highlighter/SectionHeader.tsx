import React from 'react';
import { Button } from 'antd';

interface ISectionHeaderProps {
  title: string;
  onClose?: () => void;
  closeDisabled?: boolean;
}

export default function SectionHeader(props: ISectionHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <h2 style={{ fontWeight: 600, margin: 0 }}>{props.title}</h2>
      {props.onClose && (
        <div>
          <Button type="text" onClick={props.onClose} disabled={props.closeDisabled}>
            <i className="icon-close" style={{ margin: 0 }}></i>
          </Button>
        </div>
      )}
    </div>
  );
}
