import { useCallback, useEffect, useState } from 'react';
import { ViewId, isViewId } from '../lib/navigation.ts';

function readView(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return isViewId(raw) ? raw : 'dashboard';
}

/**
 * Keeps the current screen in the URL (#/transactions), so the browser Back button,
 * bookmarks and reloads all land on the same screen.
 */
export function useHashView() {
  const [view, setViewState] = useState<ViewId>(readView);

  useEffect(() => {
    const onHashChange = () => setViewState(readView());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setView = useCallback((next: string) => {
    if (!isViewId(next)) return;
    if (window.location.hash !== `#/${next}`) {
      window.location.hash = `/${next}`;
    }
    setViewState(next);
  }, []);

  return [view, setView] as const;
}
