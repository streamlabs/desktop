import { camelize } from 'humps';
import React, { useEffect, useState, ReactElement, createElement } from 'react';
import keyBy from 'lodash/keyBy';

/**
 * Convert xml message from i18n dictionary into a React component
 *
 * @example Usage with a Vue template
 * <pre>
 *
 *   <Translate message="To continue please <my-link>click here </my-link>">
 *      <a slot="myLink" onClick="onClickHandler"/>
 *   </Translate>
 *
 * </pre>
 */
export default function Translate(p: {
  message: string;
  children?: ReactElement[] | ReactElement;

  /**
   * Optional: pass individual render functions for each slot
   */
  renderSlots?: Dictionary<(text: string) => ReactElement>;
}) {
  let children: ReactElement[] = [];
  if (p.children) {
    children = Array.isArray(p.children) ? p.children : [p.children];
  }

  const [s, setState] = useState<{
    xmlNodes: ChildNode[];
    xmlNamedNodes: Record<string, ChildNode>;
    namedReactNodes: Record<string, ReactElement>;
  }>({ xmlNodes: [], xmlNamedNodes: {}, namedReactNodes: {} });

  useEffect(() => {
    const xmlNodes: ChildNode[] = [];
    const xmlNamedNodes: Record<string, ChildNode> = {};

    // use built-in xml parser to extract xml-nodes
    const xmlDoc = new DOMParser().parseFromString(`<root> ${p.message} </root>`, 'text/xml');
    const nodeList = xmlDoc.childNodes[0].childNodes;
    nodeList.forEach(node => {
      xmlNodes.push(node);
      if (node.nodeName !== '#text') xmlNamedNodes[node.nodeName] = node;
    });

    // create a map of child nodes
    const namedReactNodes = keyBy(children, node => node.props.slot) as Record<
      string,
      ReactElement
    >;

    setState({ xmlNodes, xmlNamedNodes, namedReactNodes });
  }, [p.message]);

  function render() {
    return <span>{s.xmlNodes.map(renderXmlNode)}</span>;
  }

  function renderXmlNode(xmlNode: ChildNode, ind: number) {
    // don't handle script nodes
    if (xmlNode.nodeName === 'script') {
      throw new Error('XSS injection detected');
    }

    // render simple text
    if (xmlNode.nodeName === '#text') {
      return xmlNode.textContent;
    }

    // render slots if found
    const slotName = camelize(xmlNode['tagName']);
    const namedReactNode = s.namedReactNodes[slotName];
    if (namedReactNode) {
      return createElement(
        namedReactNode.type,
        { ...namedReactNode.props, key: ind },
        xmlNode.textContent,
      );
    } else if (p.renderSlots && p.renderSlots[slotName]) {
      // A custom render function was passed for this slot
      return p.renderSlots[slotName](xmlNode.textContent ?? '');
    } else {
      // render simple html tags like <a><b><i><strong>
      // attributes are not supported
      return createElement(xmlNode.nodeName, { key: ind }, xmlNode.textContent);
    }
  }

  return render();
}
