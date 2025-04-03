import React from 'react';

const SVG_ATTRS_REGEX = /(\S+)=["']?((?:.(?!["']?\s+(?:\S+)=|[>"']))+.)["']?/gm;

export default function SvgContainer(p: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  function svgAttrs() {
    const svgMatch = p.src.match(/<svg\w?([^<]+)/);
    const svgTag = (svgMatch && svgMatch[0]) || '';
    const attrs = {};
    let attrMatch;
    while ((attrMatch = SVG_ATTRS_REGEX.exec(svgTag)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    return attrs;
  }

  function derivePaths() {
    const pathsMatch = p.src.match(/>\s*(<.*>)\s*</s);

    return (pathsMatch && pathsMatch[1]) || '';
  }

  return (
    <svg
      {...svgAttrs()}
      className={p.className}
      style={p.style}
      dangerouslySetInnerHTML={{ __html: derivePaths() }}
    />
  );
}
