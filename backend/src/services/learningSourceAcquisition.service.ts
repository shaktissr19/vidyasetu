import axios from 'axios';
import { lookup } from 'dns/promises';
import { Agent } from 'https';
import { isIP } from 'net';
import { createHash, randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { s3, BUCKET, deleteObject } from '../config/s3';
import { assertLearningAssetType, assertLearningRightsPolicy, assertOfficialEmbedUrl } from './learningDeliveryPolicy';
import { query } from '../config/db';
import * as pipeline from './learningContentPipeline.service';

const fail = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
export function approvedAssetUrl(raw: string, hosts = process.env.LEARNING_IMPORT_ALLOWED_HOSTS || 'obj.diksha.gov.in') {
  let url: URL;
  try { url = new URL(raw); } catch { throw fail('Enter an HTTPS URL for the actual media file'); }
  const allowed = hosts.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || isIP(url.hostname) || !allowed.includes(url.hostname.toLowerCase())) {
    throw fail('Media import requires an exact approved HTTPS host. Provider page URLs are not media files.');
  }
  return url;
}

/** Return only provider URLs that meet the same strict import policy used by the downloader. */
export function importableAssetUrl(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  for (const value of [metadata.artifactUrl, metadata.artifactURL, metadata.downloadUrl, metadata.downloadURL, metadata.contentUrl, metadata.contentURL, metadata.streamingUrl, metadata.previewUrl]) {
    if (typeof value !== 'string' || !value.trim()) continue;
    try { return approvedAssetUrl(value).toString(); } catch { /* Try the next explicit media URL field. */ }
  }
  return null;
}

export async function scanImportedAsset(bytes: Buffer): Promise<void> {
  await new Promise<void>((resolve,reject) => {
    const child = spawn('clamscan',['--no-summary','-'],{stdio:['pipe','ignore','ignore']});
    const timer = setTimeout(() => { child.kill(); reject(fail('Media scanning timed out. Import was not saved.')); },30000);
    child.on('error',() => { clearTimeout(timer); reject(fail('Media import requires ClamAV clamscan with current signatures on the server. Import was not saved.')); });
    child.stdin.on('error',() => undefined);
    child.on('close',code => { clearTimeout(timer); if(code===0) resolve(); else reject(fail('Media scan failed or detected unsafe content. Import was not saved.')); });
    child.stdin.end(bytes);
  });
}

export function publicAddress(address: string): boolean {
  // Imports are pinned to IPv4 below. Reject private, link-local, documentation,
  // benchmarking, multicast and otherwise reserved IPv4 ranges.
  if (isIP(address) !== 4) return false;
  const [a,b] = address.split('.').map(Number);
  const c = Number(address.split('.')[2]);
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a === 255) return false;
  return true;
}

export function choosePublicIpv4(addresses: Array<{ address: string; family: number }>): string | null {
  const ipv4 = addresses.filter((entry) => entry.family === 4);
  if (!ipv4.length || ipv4.some((entry) => !publicAddress(entry.address))) return null;
  return ipv4[0].address;
}

export function inspectImportedBytes(bytes: Buffer, kind: string, mime: string) {
  try { assertLearningAssetType(kind,mime); } catch (error) { throw fail((error as Error).message); }
  const prefix = bytes.subarray(0,16);
  const valid = mime === 'application/pdf' ? prefix.subarray(0,5).toString() === '%PDF-'
    : ['video/mp4','audio/mp4'].includes(mime) ? prefix.subarray(4,8).toString() === 'ftyp'
    : mime === 'video/webm' ? prefix.subarray(0,4).toString('hex') === '1a45dfa3'
    : mime === 'image/png' ? prefix.subarray(0,8).toString('hex') === '89504e470d0a1a0a'
    : mime === 'image/jpeg' ? prefix.subarray(0,3).toString('hex') === 'ffd8ff'
    : ['image/webp','audio/wav'].includes(mime) ? prefix.subarray(0,4).toString() === 'RIFF' && prefix.subarray(8,12).toString() === (mime === 'image/webp' ? 'WEBP' : 'WAVE')
    : mime === 'audio/ogg' ? prefix.subarray(0,4).toString() === 'OggS'
    : mime === 'audio/mpeg' ? prefix.subarray(0,3).toString() === 'ID3' || (prefix[0] === 255 && (prefix[1] & 224) === 224)
    : false;
  if (!valid) throw fail('Downloaded bytes do not match a supported passive media format. HTML, ZIP packages and documents needing conversion must use a reviewed upload.');
}

export async function downloadLicensedAsset(raw: string, kind: string, allowedHosts?: string) {
  const url = approvedAssetUrl(raw, allowedHosts);
  // Resolve only A records. Ignore IPv6 answers because the importer pins an
  // IPv4 socket; still reject a hostname if any IPv4 answer is non-public.
  const addresses = await lookup(url.hostname,{ all: true, family: 4, verbatim: true }).catch(() => []);
  const address = choosePublicIpv4(addresses);
  if (!address) throw fail('Provider host has no safe public IPv4 address for media import');
  const agent = new Agent({ family:4, lookup: (_hostname,_options,callback) => callback(null,address,4) });
  const requestedLimit = Number(process.env.LEARNING_IMPORT_MAX_BYTES || 50 * 1024 * 1024);
  const maxBytes = Number.isFinite(requestedLimit) ? Math.min(150 * 1024 * 1024,Math.max(1024,requestedLimit)) : 50 * 1024 * 1024;
  try {
    const response = await axios.get<ArrayBuffer>(url.toString(),{ responseType:'arraybuffer',httpsAgent:agent,proxy:false,maxRedirects:0,timeout:60000,maxContentLength:maxBytes,maxBodyLength:maxBytes,headers:{Accept:'video/*,audio/*,image/*,application/pdf'} });
    const bytes = Buffer.from(response.data);
    if (!bytes.length || bytes.length > maxBytes) throw fail('Media file is empty or exceeds the configured import limit');
    const mime = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    inspectImportedBytes(bytes,kind,mime);
    return { bytes,mime,checksum:createHash('sha256').update(bytes).digest('hex') };
  } catch (error) { throw fail(axios.isAxiosError(error) ? 'Provider download failed or exceeded the limit. Redirects, login pages and protected streams are not imported. Use a reviewed local upload instead.' : (error as Error).message); } finally { agent.destroy(); }
}

export function deliveryCapability(item: { resource_id?: unknown; reference_only?: boolean; media_kind?: string | null; embed_url?: string | null; metadata?: Record<string,unknown> }) {
  if (item.resource_id) return { code:'LIBRARY',label:'Already in VidyaSetu Library' };
  if (item.reference_only) return { code:'REFERENCE',label:'Provider search only — choose an individual item' };
  const asset = importableAssetUrl(item.metadata);
  // Only media types rendered by LearningAsset can be offered as in-platform
  // previews/imports. A source article, course, ECML package or portal URL must
  // not be labelled playable just because discovery returned artifactUrl.
  if (['VIDEO','AUDIO','IMAGE','PDF'].includes(String(item.media_kind || '').toUpperCase()) && asset) return { code:'IMPORT',label:'Media file available — review and import into VidyaSetu' };
  if (item.embed_url) { try { assertOfficialEmbedUrl(item.embed_url); return { code:'EMBED',label:'Official player available — rights review required' }; } catch { /* Raw streaming URLs are not official players. */ } }
  return { code:'REFERENCE',label:'Delivery needs configuration — source page only' };
}

export async function acquireContent(input: pipeline.StagePipelineInput & { assetUrl: string; permissionConfirmed: boolean }, adminId: string) {
  if (!input.permissionConfirmed) throw fail('Confirm you reviewed permission to copy and distribute this specific asset');
  if (input.deliveryMode !== 'LICENSED_REHOST') throw fail('Provider imports must use licensed hosted delivery');
  approvedAssetUrl(input.assetUrl);
  try { assertLearningRightsPolicy({deliveryMode:input.deliveryMode,licence:input.licenceCandidate || 'OTHER',accessRequirement:input.accessRequirement,evidenceUrl:input.rightsEvidenceUrl,attribution:input.attributionText,sourceCode:input.sourceCode}); } catch (error) { throw fail((error as Error).message); }
  if (input.intakeId) {
    const { rows:[item] } = await query('SELECT imported_resource_id FROM learning_source_intake WHERE id=$1::uuid',[input.intakeId]);
    if (!item) throw fail('Selected intake was not found');
    if (item.imported_resource_id) throw fail('This item is already in Library; open its draft rather than importing again');
  }
  const asset = await downloadLicensedAsset(input.assetUrl,input.mediaKind);
  await scanImportedAsset(asset.bytes);
  const key = `learning/imported/${randomUUID()}`;
  await s3.putObject({Bucket:BUCKET,Key:key,Body:asset.bytes,ContentType:asset.mime,Metadata:{sha256:asset.checksum}}).promise();
  try {
    // The reviewed URL and checksum remain in metadata and the existing STAGED audit record.
    const result = await pipeline.stageContent({...input,storageKey:key,mimeType:asset.mime,byteSize:asset.bytes.length,checksumSha256:asset.checksum},adminId,{url:input.assetUrl,actorId:adminId,acquiredAt:new Date().toISOString(),permissionConfirmed:true});
    return result; // Rights verification and approval remain explicit actions, never automatic publication.
  } catch (error) { await deleteObject(key).catch(() => undefined); throw error; }
}
