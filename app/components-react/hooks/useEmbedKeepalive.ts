import { useState, useRef, useEffect } from 'react';

const EMBED_PAGES = ['Cloudbot', 'AlertBox', 'Widgets'] as const;

export function useEmbedKeepalive(page: string, discardMs: number) {
  const [persistedEmbeds, setPersistedEmbeds] = useState<string[]>([]);
  const discardTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Activate: cancel pending discard, add to persisted list.
  useEffect(() => {
    if (!(EMBED_PAGES as readonly string[]).includes(page)) return;
    const t = discardTimers.current.get(page);
    if (t) {
      clearTimeout(t);
      discardTimers.current.delete(page);
    }
    setPersistedEmbeds(prev => (prev.includes(page) ? prev : [...prev, page]));
  }, [page]);

  // Deactivate: schedule discard timers for hidden embeds.
  useEffect(() => {
    persistedEmbeds.forEach(name => {
      if (name === page || discardTimers.current.has(name)) return;
      const t = setTimeout(() => {
        setPersistedEmbeds(prev => prev.filter(n => n !== name));
        discardTimers.current.delete(name);
      }, discardMs);
      discardTimers.current.set(name, t);
    });
  }, [persistedEmbeds, page, discardMs]);

  // Cleanup all pending timers on unmount.
  useEffect(() => {
    return () => {
      discardTimers.current.forEach(clearTimeout);
    };
  }, []);

  return {
    persistedEmbeds,
    isEmbedPage: (EMBED_PAGES as readonly string[]).includes(page),
  };
}
