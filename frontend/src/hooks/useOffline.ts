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

  // Existing consumers already treat a missing cache list as empty. Exposing
  // the empty list explicitly keeps that runtime behavior while making the
  // hook contract strict-TypeScript friendly.
  const cachedSubjects: string[] = [];

  return { isOnline, downloadSubject, cachedSubjects };
}

export default useOffline;
