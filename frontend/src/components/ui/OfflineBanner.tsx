import { useEffect, useRef, useState } from 'react';
import { useOfflineSync } from '../../hooks/useOfflineSync';

export function OfflineBanner() {
  const { isOnline, pendingCount, syncStatus } = useOfflineSync();
  const [showFlash, setShowFlash] = useState(false);
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      setShowFlash(true);
      const t = setTimeout(() => setShowFlash(false), 3000);
      prevOnline.current = true;
      return () => clearTimeout(t);
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  if (isOnline && !showFlash) return null;

  if (showFlash) {
    return (
      <div className="sticky top-0 z-50 bg-green-500 text-white text-sm py-2 px-4 flex items-center justify-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Back online{pendingCount > 0 ? ' — syncing changes…' : ''}
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-white text-sm py-2 px-4 flex items-center justify-center gap-2">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 8.464a5 5 0 000 7.072M5.636 5.636a9 9 0 000 12.728" />
      </svg>
      <span>
        {syncStatus === 'syncing'
          ? 'Syncing…'
          : `You're offline — viewing cached vault${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`}
      </span>
    </div>
  );
}
