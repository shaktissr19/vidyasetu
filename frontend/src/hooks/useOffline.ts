'use client';

import { useCallback, useEffect, useState } from 'react';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const downloadSubject = useCallback(async (subjectId: string) => {
    console.log('Download queued for:', subjectId);
  }, []);

  return { isOnline, downloadSubject };
}

export default useOffline;
