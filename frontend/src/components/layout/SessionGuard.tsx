'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useAuthStore from '@/store/authStore';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_PRESENCE_HEARTBEAT_MS,
  getTrackedSessionExpiryReason,
  hasTrackedSession,
  sessionReasonMessage,
  touchSessionActivity,
  touchSessionPresence,
  type SessionExpiryReason,
} from '@/lib/sessionPolicy';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
const MEDIA_ACTIVITY_EVENTS = ['play', 'timeupdate'] as const;
const ACTIVITY_WRITE_THROTTLE_MS = 15_000;

export default function SessionGuard() {
  const queryClient = useQueryClient();
  const { isLoggedIn, accessToken, refreshToken, logout } = useAuthStore();
  const endingRef = useRef(false);
  const lastActivityWriteRef = useRef(0);

  const clearLocalSession = useCallback((redirect = true) => {
    logout();
    queryClient.clear();
    if (redirect) window.location.replace('/login');
  }, [logout, queryClient]);

  const endSession = useCallback(async (reason: SessionExpiryReason) => {
    if (endingRef.current) return;
    endingRef.current = true;

    const currentAccessToken = useAuthStore.getState().accessToken;
    const currentRefreshToken = useAuthStore.getState().refreshToken;

    try {
      if (currentRefreshToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {}),
          },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify({ refreshToken: currentRefreshToken }),
        });
      }
    } catch (_error: unknown) {
      // Local session termination must succeed even when the network is unavailable.
    } finally {
      logout();
      queryClient.clear();
      window.sessionStorage.setItem('vs_session_expired_message', sessionReasonMessage(reason));
      window.location.replace(`/login?reason=${reason}`);
    }
  }, [logout, queryClient]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken || !refreshToken) return undefined;

    // Sessions persisted by an older build have no activity/presence record.
    // They must not silently become trusted when this security policy is deployed.
    if (!hasTrackedSession()) {
      void endSession('away');
      return undefined;
    }

    const initialReason = getTrackedSessionExpiryReason();
    if (initialReason) {
      void endSession(initialReason);
      return undefined;
    }

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastActivityWriteRef.current = now;
      touchSessionActivity(now);
    };

    const onMediaActivity = () => {
      if (document.visibilityState === 'visible') onActivity();
    };

    const checkSession = () => {
      // A logout in another tab removes the persisted auth/tracking values.
      if (!hasTrackedSession() || !window.localStorage.getItem('vs_access_token')) {
        clearLocalSession();
        return;
      }
      const reason = getTrackedSessionExpiryReason();
      if (reason) {
        void endSession(reason);
        return;
      }
      if (document.visibilityState === 'visible') touchSessionPresence();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!hasTrackedSession() || !window.localStorage.getItem('vs_access_token')) {
          clearLocalSession();
          return;
        }
        const reason = getTrackedSessionExpiryReason();
        if (reason) {
          void endSession(reason);
          return;
        }
        touchSessionPresence();
      } else {
        touchSessionPresence();
      }
    };

    const onPageHide = () => touchSessionPresence();
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (event.key === 'vs_access_token' || event.key === 'vidyasetu-auth' || event.key.startsWith('vs_session_')) {
        if (!window.localStorage.getItem('vs_access_token') || !hasTrackedSession()) clearLocalSession();
      }
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    for (const eventName of MEDIA_ACTIVITY_EVENTS) {
      document.addEventListener(eventName, onMediaActivity, true);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('storage', onStorage);

    const checkInterval = window.setInterval(checkSession, SESSION_PRESENCE_HEARTBEAT_MS);
    const idleDeadlineTimer = window.setTimeout(checkSession, SESSION_IDLE_TIMEOUT_MS + 1_000);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) window.removeEventListener(eventName, onActivity);
      for (const eventName of MEDIA_ACTIVITY_EVENTS) document.removeEventListener(eventName, onMediaActivity, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(checkInterval);
      window.clearTimeout(idleDeadlineTimer);
    };
  }, [accessToken, clearLocalSession, endSession, isLoggedIn, refreshToken]);

  return null;
}
