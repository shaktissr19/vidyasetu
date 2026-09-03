'use client';

import { useEffect } from 'react';
import useAuthStore from '@/store/authStore';
import { flushOfflineQueue } from '@/lib/offlineLearning';
import { capturePwaInstallPrompt, clearPwaInstallPrompt } from '@/lib/pwa';

export default function PwaRuntime() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    let cancelled = false;

    async function register(): Promise<void> {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;
        if (registration.waiting) {
          window.dispatchEvent(new CustomEvent('vidyasetu:pwa-update-ready'));
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('vidyasetu:pwa-update-ready'));
            }
          });
        });
      } catch {
        // PWA support is progressive enhancement; the web app must continue to work without it.
      }
    }

    void register();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => capturePwaInstallPrompt(event);
    const onInstalled = () => clearPwaInstallPrompt();
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (user?.role !== 'STUDENT' || !user.id) return undefined;
    const userId = user.id;
    let active = true;

    async function sync(): Promise<void> {
      if (!active || navigator.onLine === false) return;
      try {
        const result = await flushOfflineQueue(userId);
        if (active) {
          window.dispatchEvent(new CustomEvent('vidyasetu:offline-sync', { detail: result }));
        }
      } catch {
        // The queue remains durable in IndexedDB and will be retried on the next online event/startup.
      }
    }

    void sync();
    const onOnline = () => { void sync(); };
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
    };
  }, [user?.id, user?.role]);

  return null;
}
