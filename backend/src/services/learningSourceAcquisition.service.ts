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
  // Deliberately require globally routable IPv4; reject IPv6 and reserved/mapped/private ranges.
  if (isIP(address) !== 4) return false;
  const [a,b] = address.split('.').map(Number);
  return a !== 0 && a !== 10 && a !== 127 && a < 224 && a !== 169 && a !== 192
    && !(a === 172 && b >= 16 && b <= 31) && !(a === 100 && b >= 64 && b <= 127)
    && !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0);
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

export async function downloadLicensedAsset(raw: string, kind: string) {
  const url = approvedAssetUrl(raw);
  const addresses = await lookup(url.hostname,{ all: true });
  if (!addresses.length || addresses.some(x => !publicAddress(x.address))) throw fail('Provider host resolves to a private or unsupported address');
  const address = addresses[0].address;
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

export function deliveryCapability(item: { resource_id?: unknown; reference_only?: boolean; embed_url?: string | null; metadata?: Record<string,unknown> }) {
  if (item.resource_id) return { code:'LIBRARY',label:'Already in VidyaSetu Library' };
  if (item.reference_only) return { code:'REFERENCE',label:'Provider search only — choose an individual item' };
  if (item.embed_url) { try { assertOfficialEmbedUrl(item.embed_url); return { code:'EMBED',label:'Official player available — rights review required' }; } catch { /* Raw streaming URLs are not official players. */ } }
  const asset = item.metadata?.artifactUrl;
  if (typeof asset === 'string') { try { approvedAssetUrl(asset); return { code:'IMPORT',label:'Media URL available — verify rights and file format' }; } catch { /* No host approval. */ } }
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
