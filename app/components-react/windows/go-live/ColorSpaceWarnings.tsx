import React from 'react';
import { Alert } from 'antd';

interface ColorSpaceWarningProps {
  warnings: string;
}

export default function ColorSpaceWarnings({ warnings }: ColorSpaceWarningProps) {
  return <Alert type="warning" message={warnings} closable style={{ marginBottom: 16 }} />;
}
