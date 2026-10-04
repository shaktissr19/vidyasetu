'use client';

import { useEffect, useState } from 'react';

/** Shared learner/admin preview. Documents stay passive; uploaded HTML/JS is never executed. */
export default function LearningAsset({ title, kind, contentUrl, embedUrl, mimeType, altText, transcript }: {
  title: string; kind: string; contentUrl?: string | null; embedUrl?: string | null;
  mimeType?: string | null; altText?: string | null; transcript?: string | null;
}) {
  const safeEmbed = embedUrl && /^https:\/\//i.test(embedUrl) ? embedUrl : null;
  const [playerLoaded,setPlayerLoaded] = useState(false);
  useEffect(() => { setPlayerLoaded(false); },[safeEmbed]);
  const youtube = Boolean(safeEmbed?.includes('youtube.com/') || safeEmbed?.includes('youtube-nocookie.com/'));
  return <section aria-label={`${title} learning media`} style={{ marginBottom: 24 }}>
    {safeEmbed && !playerLoaded && <div><p>This player loads content from its provider, which may use cookies and show branding or ads.</p><button type="button" onClick={() => setPlayerLoaded(true)} className="btn-primary">Load official player</button>
      {youtube && <p><small>By loading this YouTube player, you agree to <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube’s terms</a>. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google’s privacy policy</a>.</small></p>}
    </div>}
    {safeEmbed && playerLoaded && <iframe title={`${title} official player`} src={safeEmbed} loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin"
      allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen
      style={{ width: '100%', minHeight: 200, aspectRatio: '16 / 9', border: 0, borderRadius: 14, background: '#0F172A' }} />}
    {contentUrl && kind === 'VIDEO' && <video aria-label={title} controls preload="metadata" src={contentUrl} style={{ width: '100%', borderRadius: 14 }} />}
    {contentUrl && kind === 'AUDIO' && <audio aria-label={title} controls preload="metadata" src={contentUrl} style={{ width: '100%' }} />}
    {contentUrl && kind === 'IMAGE' && <img src={contentUrl} alt={altText || title} style={{ width: '100%', maxHeight: 620, objectFit: 'contain' }} />}
    {contentUrl && ['PDF','WORKSHEET','QUESTION_PAPER'].includes(kind) && <object aria-label={title} data={contentUrl} type="application/pdf" width="100%" height="680">
      <p>Your browser cannot preview this document. <a href={contentUrl} target="_blank" rel="noopener noreferrer">Open the PDF</a></p>
    </object>}
    {contentUrl && kind === 'DOCUMENT' && <p><a href={contentUrl} target="_blank" rel="noopener noreferrer">Download {mimeType === 'text/plain' ? 'text document' : 'document'}: {title}</a><br /><small>For an in-page document preview, publish a reviewed PDF version alongside this file.</small></p>}
    {transcript && <details style={{ marginTop: 12 }}><summary>Transcript / accessible text</summary><p style={{ whiteSpace: 'pre-wrap' }}>{transcript}</p></details>}
  </section>;
}
