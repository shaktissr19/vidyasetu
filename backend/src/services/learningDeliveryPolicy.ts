/** Technical eligibility is separate from the administrator's item-level permission review. */
export function assertOfficialEmbedUrl(raw: string, extraHosts = process.env.LEARNING_EMBED_ALLOWED_HOSTS || ''): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Enter a valid official embed URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Official players must use HTTPS without credentials or a custom port');
  }
  const host = url.hostname.toLowerCase();
  const approved = extraHosts.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const builtIn = ((host === 'www.youtube-nocookie.com' || host === 'www.youtube.com') && /^\/embed\/[a-zA-Z0-9_-]+$/.test(url.pathname))
    || (host === 'player.vimeo.com' && /^\/video\/\d+$/.test(url.pathname))
    || (host === 'phet.colorado.edu' && /^\/sims\//.test(url.pathname));
  if (!builtIn && !approved.includes(host)) throw new Error('Player host/path is not approved for embedding. Use an approved player or a licensed upload');
  url.hash = '';
  return url.toString();
}

export function assertLearningRightsPolicy(input: {
  deliveryMode: string; licence: string; accessRequirement: string;
  evidenceUrl?: string | null; attribution?: string | null; sourceCode?: string; embedUrl?: string | null;
}): void {
  if (!input.attribution?.trim()) throw new Error('Creator/publisher attribution is required');
  if (input.deliveryMode === 'VIDYASETU_ORIGINAL') {
    if (input.sourceCode !== 'VIDYASETU_ORIGINAL' || input.licence !== 'VIDYASETU_ORIGINAL') {
      throw new Error('Original content must use the VidyaSetu original source and licence');
    }
    return;
  }
  if (input.licence === 'VIDYASETU_ORIGINAL' || input.licence === 'OTHER') throw new Error('External content needs a concrete item-level licence or link-only permission');
  if (!input.evidenceUrl?.trim()) throw new Error('Record the exact item-level rights/embedding evidence URL');
  if (input.deliveryMode === 'OFFICIAL_EMBED' && input.embedUrl) assertProviderEmbedAccess(input.embedUrl,input.accessRequirement);
  if (input.deliveryMode === 'LICENSED_REHOST' && input.licence === 'EXTERNAL_LINK_ONLY') throw new Error('Link-only permission does not allow rehosting');
  if (input.accessRequirement === 'SUBSCRIBER' && (input.licence.includes('_NC') || input.licence === 'EXTERNAL_LINK_ONLY')) {
    throw new Error('Subscriber delivery requires verified commercial-use permission; non-commercial or link-only rights are insufficient');
  }
}

export function assertProviderEmbedAccess(embedUrl: string, accessRequirement: string): void {
  const host = new URL(embedUrl).hostname;
  if (['www.youtube.com','www.youtube-nocookie.com'].includes(host) && accessRequirement === 'SUBSCRIBER') {
    throw new Error('YouTube embedded playback cannot be sold behind subscriber access. Use free access or separately licensed hosted media');
  }
}

export const LEARNING_UPLOAD_TYPES: Record<string, string[]> = {
  VIDEO: ['video/mp4', 'video/webm'], AUDIO: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg'],
  IMAGE: ['image/png', 'image/jpeg', 'image/webp'], PDF: ['application/pdf'],
  WORKSHEET: ['application/pdf'], QUESTION_PAPER: ['application/pdf'],
  DOCUMENT: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
};

export function assertLearningAssetType(kind: string, mime: string | null | undefined): void {
  if (!LEARNING_UPLOAD_TYPES[kind]?.includes(mime || '')) throw new Error(`Unsupported ${kind.toLowerCase()} file type. Choose a supported file matching the selected format`);
}
