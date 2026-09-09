'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';

export default function SessionExpiryNotice() {
  useEffect(() => {
    const message = window.sessionStorage.getItem('vs_session_expired_message');
    if (!message) return;
    window.sessionStorage.removeItem('vs_session_expired_message');
    toast(message, { icon: '🔒', duration: 6000 });
  }, []);

  return null;
}
