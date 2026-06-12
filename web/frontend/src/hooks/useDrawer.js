import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Drawer state lives in the URL (?id=CAND_X) so candidate views are
 *  deep-linkable and survive navigation; the drawer itself renders once
 *  in Layout. */
export function useDrawer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const drawerId = searchParams.get('id');

  const openDrawer = useCallback(
    (id) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('id', id);
        return next;
      }),
    [setSearchParams]
  );

  const closeDrawer = useCallback(
    () =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('id');
        return next;
      }),
    [setSearchParams]
  );

  return { drawerId, openDrawer, closeDrawer };
}
