'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';

export default function SessionExpiryNotice() {
  useEffect(() => {
    const message = window.sessionStorage.getItem('vs_session_expired_message');
    if (!message) return;
    window.sessionStorage.removeItem('vs_session_expired_message');
    const reason = new URLSearchParams(window.location.search).get('reason');
    // A session notice belongs to the explicit expiry redirect. Discard an
    // old notice when the user later opens the login page normally.
    if (reason !== 'away' && reason !== 'idle') return;
    toast(message, { icon: '🔒', duration: 6000 });
  }, []);

  return null;
}
