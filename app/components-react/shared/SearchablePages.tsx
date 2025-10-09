import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import Spinner from './Spinner';
import Mark from 'mark.js';
import styles from './SearchablePages.m.less';
import { TCategoryName } from 'services/settings';
import { SETTINGS_CONFIG } from 'components-react/windows/Settings';
import { createRoot } from 'components-react/root/ReactRoot';

interface ISearchablePagesProps {
  page: TCategoryName;
  pages: TCategoryName[];
  searchStr: string;
  onSearchCompleted?: (results: string[]) => void;
}

export default function SearchablePages(p: React.PropsWithChildren<ISearchablePagesProps>) {
  const pagesInfo = useRef<PartialRec<TCategoryName, string> | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  // Search pages when receiving a search string input
  useEffect(() => {
    if (loading || p.searchStr === '' || p.searchStr.length < 3) return;
    async function searchHandler() {
      // build cache of info on pages if it doesn't exist
      if (!pagesInfo.current) await scanPages();

      // find matching info in cache
      const searchResultPages: TCategoryName[] = [];
      if (!pagesInfo.current) return;
      for (const pageName of Object.keys(pagesInfo.current)) {
        const pageText = pagesInfo.current[pageName as TCategoryName];
        if (pageText && pageText.match(new RegExp(p.searchStr, 'ig'))) {
          searchResultPages.push(pageName as TCategoryName);
        }
      }
      if (searchResultPages.length === 0) return;
      // we send out search results to receive as props here
      // in order to properly display the searched page
      p.onSearchCompleted && p.onSearchCompleted(searchResultPages);
    }

    searchHandler().then(highlightPage);
  }, [p.searchStr, loading]);

  // Highlight new page if necessary
  useEffect(() => {
    if (loading || p.searchStr === '' || p.searchStr.length < 3) return;
    highlightPage();
  }, [p.page]);

  // /**
  //  * fetch and cache all text information from settings pages
  //  */
  async function scanPages() {
    setLoading(true);
    pagesInfo.current = {};

    for (const page of p.pages) {
      const component = SETTINGS_CONFIG[page].component;

      // collect the page text and text from inputs
      pagesInfo.current[page] = await grabReactTextContent(component);
    }

    setLoading(false);
  }

  async function grabReactTextContent(component: React.FunctionComponent<any>): Promise<string> {
    if (!component) return '';
    const tempDiv = document.createElement('div');
    const RootedComponent = createRoot(component);
    await ReactDOM.render(<RootedComponent />, tempDiv);
    const stringValue = tempDiv.innerText || '';
    await ReactDOM.unmountComponentAtNode(tempDiv);
    tempDiv.remove();
    return stringValue;
  }

  /**
   * this method highlights search matches by modifying DOM elements inside `pageRef`
   * this is not a recommended way to interact with elements
   * so it should be used carefully
   */
  function highlightPage() {
    if (!pageRef.current) return;
    // highlight the page text via Mark.js
    const mark = new Mark(pageRef.current);
    mark.unmark();
    if (p.searchStr) mark.mark(p.searchStr);

    // highlight inputs
    const pageInfo = pagesInfo.current && pagesInfo.current[p.page];
    if (pageInfo) {
      getPageInputs().forEach($input => {
        $input.classList.remove('search-highlight');
        const needHighlight = p.searchStr && inputText($input).match(new RegExp(p.searchStr, 'i'));
        if (needHighlight) $input.classList.add('search-highlight');
      });
    }

    // highlight buttons
    pageRef.current.querySelectorAll('button').forEach($btn => {
      $btn.classList.remove('search-highlight');
      if (!$btn.querySelectorAll('mark').length) return;
      $btn.classList.add('search-highlight');
    });

    // scroll to the first highlighted element
    const $scrollToEl = pageRef.current.querySelector('mark, .search-highlight');
    if ($scrollToEl) $scrollToEl.scrollIntoView({ block: 'nearest' });
  }

  function inputText($input: HTMLDivElement) {
    // collect the text from text-inputs
    const inputsText = Array.from($input.querySelectorAll('[type="text"]'))
      .map(($textInput: HTMLInputElement) => $textInput.value)
      .join(' ');

    // collect the text from list-options
    const listOptionsText = Array.from($input.querySelectorAll('[data-option-value]'))
      .map(($option: HTMLSpanElement) => $option.innerText)
      .join(' ');

    return `${inputsText} ${$input.innerText} ${listOptionsText}`;
  }

  function getPageInputs(): HTMLDivElement[] {
    if (!pageRef.current) return [];
    return Array.from(
      pageRef.current.querySelectorAll('[data-role="input"]'),
    ).filter(($el: HTMLDivElement) =>
      $el.matches(':not([data-search-exclude])'),
    ) as HTMLDivElement[];
  }

  return (
    <div className={styles.searchablePages}>
      {loading && <Spinner />}
      <div ref={pageRef}>{!loading && p.children}</div>
    </div>
  );
}
