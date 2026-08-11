import React, { HTMLAttributes } from 'react';

interface ISectionProps {
  title?: string;
}

/**
 * renders a section wrapper
 */
export function Section(p: ISectionProps & HTMLAttributes<unknown>) {
  return (
    <div className="section">
      {p.title && <h3>{p.title}</h3>}
      <div>{p.children}</div>
    </div>
  );
}
