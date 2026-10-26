'use client';

import { useEffect, useRef, useState } from 'react';

/** Shared learner/admin preview. Documents stay passive; uploaded HTML/JS is never executed. */
export function approvedEmbedUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase();
    const builtIn = ((host === 'www.youtube-nocookie.com' || host === 'www.youtube.com') && /^\/embed\/[a-zA-Z0-9_-]+$/.test(url.pathname))
      || (host === 'player.vimeo.com' && /^\/video\/\d+$/.test(url.pathname))
      || (host === 'phet.colorado.edu' && /^\/sims\//.test(url.pathname));
    const configured = (process.env.NEXT_PUBLIC_LEARNING_EMBED_ALLOWED_HOSTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!builtIn && !configured.includes(host)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export default function LearningAsset({ title, kind, contentUrl, embedUrl, altText, transcript, onEvent }: {
  title: string; kind: string; contentUrl?: string | null; embedUrl?: string | null;
  mimeType?: string | null; altText?: string | null; transcript?: string | null;
  onEvent?: (event: 'PLAY_START'|'WATCH_PROGRESS'|'COMPLETED'|'AUDIO_PLAY', durationSecs?: number) => void;
}) {
  const lastProgress=useRef(0);
  const safeEmbed = approvedEmbedUrl(embedUrl);
  const [playerLoaded,setPlayerLoaded] = useState(false);
  useEffect(() => { setPlayerLoaded(false); },[safeEmbed]);
  const youtube = Boolean(safeEmbed?.includes('youtube.com/') || safeEmbed?.includes('youtube-nocookie.com/'));
  return <section aria-label={`${title} learning media`} style={{ marginBottom: 24 }}>
    {embedUrl && !safeEmbed && <p role="status">This provider URL is not an approved in-page player, so it will not be opened here.</p>}
    {safeEmbed && !playerLoaded && <div><p>This player loads content from its provider, which may use cookies and show branding or ads.</p><button type="button" onClick={() => setPlayerLoaded(true)} className="btn-primary">Load official player</button>
      {youtube && <p><small>By loading this YouTube player, you agree to <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube’s terms</a>. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google’s privacy policy</a>.</small></p>}
    </div>}
    {safeEmbed && playerLoaded && <iframe title={`${title} official player`} src={safeEmbed} loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin"
      allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen
      style={{ width: '100%', minHeight: 200, aspectRatio: '16 / 9', border: 0, borderRadius: 14, background: '#0F172A' }} />}
    {contentUrl && kind === 'VIDEO' && <video aria-label={title} controls preload="metadata" src={contentUrl} onPlay={()=>onEvent?.('PLAY_START')} onEnded={()=>onEvent?.('COMPLETED')} onTimeUpdate={event=>{const time=Math.floor(event.currentTarget.currentTime);if(time-lastProgress.current>=30){lastProgress.current=time;onEvent?.('WATCH_PROGRESS',30);}}} style={{ width: '100%', borderRadius: 14 }} />}
    {contentUrl && kind === 'AUDIO' && <audio aria-label={title} controls preload="metadata" src={contentUrl} onPlay={()=>onEvent?.('AUDIO_PLAY')} onEnded={()=>onEvent?.('COMPLETED')} onTimeUpdate={event=>{const time=Math.floor(event.currentTarget.currentTime);if(time-lastProgress.current>=30){lastProgress.current=time;onEvent?.('WATCH_PROGRESS',30);}}} style={{ width: '100%' }} />}
    {contentUrl && kind === 'IMAGE' && <img src={contentUrl} alt={altText || title} style={{ width: '100%', maxHeight: 620, objectFit: 'contain' }} />}
    {contentUrl && ['PDF','WORKSHEET','QUESTION_PAPER'].includes(kind) && <object aria-label={title} data={contentUrl} type="application/pdf" width="100%" height="680">
      <p>Your browser cannot preview this PDF inside VidyaSetu. Please use a browser with built-in PDF viewing.</p>
    </object>}
    {contentUrl && kind === 'DOCUMENT' && <p role="status">This document format cannot be previewed inside VidyaSetu yet. Add a reviewed PDF version to make it learner-ready.</p>}
    {transcript && <details style={{ marginTop: 12 }}><summary>Transcript / accessible text</summary><p style={{ whiteSpace: 'pre-wrap' }}>{transcript}</p></details>}
  </section>;
}
