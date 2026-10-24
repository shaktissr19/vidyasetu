import axios from 'axios';
import { lookup } from 'dns/promises';
import { Agent } from 'https';
import { isIP } from 'net';

const fail=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const maxHtmlBytes=2_000_000;
const maxPdfBytes=25*1024*1024;
const allowedHosts=()=> (process.env.SYLLABUS_IMPORT_ALLOWED_HOSTS||'cbseacademic.nic.in,cisce.org,upmsp.edu.in,ncert.nic.in').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
function publicAddress(address:string){if(isIP(address)!==4)return false;const [a,b]=address.split('.').map(Number);return a!==0&&a!==10&&a!==127&&a<224&&a!==169&&a!==192&&!(a===172&&b>=16&&b<=31)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19||b===51))&&!(a===203&&b===0);}
async function getOfficial<T>(url:URL,config:Record<string,unknown>){const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw fail('Official source host resolves to a private or unsupported IP address.',403);const address=addresses[0].address;const agent=new Agent({family:4,lookup:(_host,_options,callback)=>callback(null,address,4)});try{return await axios.get<T>(url.toString(),{...config,httpsAgent:agent,proxy:false,maxRedirects:0} as any);}finally{agent.destroy();}}
const boardSourceHosts:Record<string,string[]>={CBSE:['cbseacademic.nic.in','ncert.nic.in'],CISCE:['cisce.org'],UPMSP:['upmsp.edu.in']};
function checkedOfficialUrl(value:string,base?:string,boardCode?:string){
 let url:URL;try{url=new URL(value,base);}catch{throw fail('The source URL is invalid.');}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(host)||!allowedHosts().some(x=>host===x||host.endsWith(`.${x}`))) throw fail('Only standard-port HTTPS URLs on approved official board domains can be fetched.');
 if(boardCode){const expected=boardSourceHosts[boardCode.toUpperCase()];if(!expected||!expected.some(x=>host===x||host.endsWith(`.${x}`)))throw fail(`No official-source connector is configured for ${boardCode}. Configure its board-specific source before fetching.`);}
 return url;
}
function cleanTitle(value:string){return value.replace(/\.(pdf|html?)($|\?.*)/i,'').replace(/[+_]/g,' ').replace(/\s+/g,' ').trim().slice(0,240)||'Official curriculum document';}
function subjectMatches(text:string,subject:string){const normalized=subject.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const aliases:Record<string,string[]>={mathematics:['mathematics','maths','math'],maths:['mathematics','maths','math'],math:['mathematics','maths','math'],'social science':['social science','social sciences','social studies'],'social studies':['social science','social sciences','social studies'],science:['science','general science'],english:['english'],hindi:['hindi']};const terms=aliases[normalized]||[normalized];return terms.some(term=>term&&text.toLowerCase().includes(term));}
const romanClasses:Record<string,number>={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12};

export interface DiscoveredSyllabusDocument {title:string;url:string;sourceHost:string;classGuess:string|null;subjectGuess:string|null;}
export function parseOfficialSyllabusIndex(sourceUrl:string,html:string,input:{boardCode:string;classCode?:string;subject?:string}){
 const source=checkedOfficialUrl(sourceUrl,undefined,input.boardCode);
 const links=new Map<string,DiscoveredSyllabusDocument>();
 const anchor=/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
 let match:RegExpExecArray|null;
 while((match=anchor.exec(html))){
  const raw=(match[1]||match[2]||match[3]||'').replace(/&amp;/g,'&');if(!/\.pdf(?:[?#]|$)/i.test(raw))continue;
  let url:URL;try{url=checkedOfficialUrl(raw,source.toString(),input.boardCode);}catch{continue;}if(url.hostname!==source.hostname&&!url.hostname.endsWith(`.${source.hostname}`))continue;
  const title=cleanTitle(match[4].replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/g,'&'))||cleanTitle(decodeURIComponent(url.pathname.split('/').pop()||''));
  const preceding=html.slice(0,match.index);const headings=[...preceding.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi)];const sectionHeading=headings.at(-1)?.[1].replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ')||'';
  const text=`${title} ${url.pathname} ${sectionHeading}`.toLowerCase();
  const classMatch=text.match(/(?:class|grade|standard|std)[\s_-]*(pre[- ]?nursery|nursery|lkg|ukg|xii|xi|x|ix|viii|vii|vi|iv|v|iii|ii|i|[1-9]|1[0-2])\b/i);
  const classMap:Record<string,string>={nursery:'NURSERY',lkg:'LKG',ukg:'UKG'};
  const classKey=classMatch?.[1].toLowerCase();const classGuess=classKey?(classMap[classKey]||`CLASS_${romanClasses[classKey.toUpperCase()]||Number(classKey)}`):null;
  const subjectGuess=input.subject&&subjectMatches(text,input.subject)?input.subject:null;
  if(input.classCode&&classGuess&&classGuess!==input.classCode)continue;
  if(input.subject&&!subjectMatches(text,input.subject))continue;
  links.set(url.toString(),{title,url:url.toString(),sourceHost:url.hostname,classGuess,subjectGuess});
 }
 const documents=[...links.values()].slice(0,250);
 return {sourceUrl:source.toString(),sourceHost:source.hostname,documents};
}
export async function discoverOfficialSyllabusDocuments(input:{boardCode:string;sourceUrl:string;classCode?:string;subject?:string}){
 const source=checkedOfficialUrl(input.sourceUrl,undefined,input.boardCode);
 let response;
 try{response=await getOfficial<string>(source,{timeout:15000,maxContentLength:maxHtmlBytes,maxBodyLength:maxHtmlBytes,responseType:'text',headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'VidyaSetu-SyllabusImporter/1.0'}});}catch(error){if((error as any)?.statusCode)throw error;throw fail('Could not fetch the official syllabus index. Check the URL and try again.',502);}
 if(typeof response.data!=='string'||!/^text\/html|^application\/xhtml\+xml/i.test(String(response.headers['content-type']||''))) throw fail('The selected source is not an HTML index page. Paste the official index page URL, not a PDF URL.');
 const result=parseOfficialSyllabusIndex(source.toString(),response.data,input);
 if(!result.documents.length)return {...result,message:'No direct PDF links were found on this page. Some board sites render links with scripts; open the official page and use the direct PDF URL or upload the document.'};
 return result;
}

export interface ExtractedOutlineRow {unit:string;chapter:string;topic:string;pageReference:string;confidence:'high'|'review';}
function pageLines(items:any[]){
 const grouped=new Map<number,{y:number;text:string}[]>();
 for(const item of items){if(typeof item.str!=='string'||!item.str.trim())continue;const y=Math.round(Number(item.transform?.[5]||0));const list=grouped.get(y)||[];list.push({y,text:item.str.trim()});grouped.set(y,list);}
 return [...grouped.entries()].sort((a,b)=>b[0]-a[0]).map(([,parts])=>parts.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim()).filter(x=>x.length>2&&x.length<260);
}
function stripIndex(line:string){return line.replace(/^\s*(?:(?:unit|chapter|part)\s+[ivxlcdm\d]+\s*[:.\-–)]?\s*|\d+(?:\.\d+)*\s*[.):\-–]?\s*|[A-Z]\s*[.):\-–]\s*)/i,'').trim();}
export function parseCurriculumOutline(pages:Array<{page:number;lines:string[]}>):ExtractedOutlineRow[]{
 const rows:ExtractedOutlineRow[]=[];let unit='Curriculum';let chapter='Topics';let pendingChapter:{unit:string;chapter:string;pageReference:string}|null=null;let chapterHasTopics=false;
 const flushChapter=()=>{if(pendingChapter&&!chapterHasTopics)rows.push({unit:pendingChapter.unit,chapter:pendingChapter.chapter,topic:pendingChapter.chapter,pageReference:pendingChapter.pageReference,confidence:'review'});pendingChapter=null;chapterHasTopics=false;};
 const seen=new Set<string>();
 for(const page of pages){for(const raw of page.lines){
  const line=raw.replace(/\s+/g,' ').trim();
  const unitHeading=/^(unit|part)\s+([ivxlcdm\d]+)\s*[:.\-–)]?\s*(.*)$/i.exec(line);
  if(unitHeading){flushChapter();unit=`${unitHeading[1][0].toUpperCase()}${unitHeading[1].slice(1)} ${unitHeading[2]}${unitHeading[3]?` · ${unitHeading[3]}`:''}`;chapter=stripIndex(unitHeading[3]||unit);continue;}
  const chapterHeading=/^(chapter\s+[ivxlcdm\d]+\s*[:.\-–)]?\s*.+|\d+(?:\.\d+)?\s*[.):\-–]\s*[A-Z][^.!?]{2,100})$/i.test(line);
  const topicHeading=/^(?:topics?\s*[:\-–]|\d+\.\d+\s+|[•●▪◦*-]\s+|[a-z]\)\s+)/i.test(line);
  const contentsLabel=/^(?:contents|index|syllabus|learning outcomes?|curricular objectives?|course structure)$/i.test(line);
  if(contentsLabel||line.length>190||/^(?:page\s+\d+|www\.|https?:|©|copyright)/i.test(line))continue;
  if(chapterHeading){const next=stripIndex(line);if(next.length>2&&next.length<180){if(next.toLowerCase()!==chapter.toLowerCase()){flushChapter();chapter=next;pendingChapter={unit,chapter,pageReference:`Page ${page.page}`};}}continue;}
  if(topicHeading){const topic=stripIndex(line.replace(/^(?:topics?\s*[:\-–]|[•●▪◦*-]\s+)/i,''));if(topic.length<4)continue;const key=`${unit}|${chapter}|${topic}`.toLowerCase();chapterHasTopics=true;if(!seen.has(key)){rows.push({unit,chapter,topic,pageReference:`Page ${page.page}`,confidence:/^\d/.test(line)?'high':'review'});seen.add(key);} }
 }}
 flushChapter();
 return rows.slice(0,5000);
}
export async function extractOfficialSyllabusOutline(pdfUrl:string,boardCode:string){
 const url=checkedOfficialUrl(pdfUrl,undefined,boardCode);let response;
 try{response=await getOfficial<ArrayBuffer>(url,{timeout:45000,maxContentLength:maxPdfBytes,maxBodyLength:maxPdfBytes,responseType:'arraybuffer',headers:{Accept:'application/pdf','User-Agent':'VidyaSetu-SyllabusImporter/1.0'}});}catch(error){if((error as any)?.statusCode)throw error;throw fail('Could not download the official PDF. It may require a browser session or direct download access.',502);}
 const bytes=Buffer.from(response.data);if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')throw fail('The official URL did not return a valid PDF.');
 const crypto=await import('crypto');
 try{
  const dynamicImport=new Function('specifier','return import(specifier)') as (specifier:string)=>Promise<any>;
  const pdfjs=await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false,enableScripting:false});const pdf=await task.promise;
  if(pdf.numPages>500){await task.destroy();throw fail('The selected PDF exceeds the 500-page extraction limit.');}
  const pages:Array<{page:number;lines:string[]}>=[];let chars=0;
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo);const content=await page.getTextContent();const lines=pageLines(content.items);chars+=lines.join('').length;if(chars>2_000_000){await task.destroy();throw fail('Extracted PDF text exceeds the 2 MB review limit.');}pages.push({page:pageNo,lines});}
  await task.destroy();if(chars<40)throw fail('This PDF has no extractable text; OCR is needed before this source can be imported.');
  const rows=parseCurriculumOutline(pages);if(!rows.length)throw fail('The PDF was read, but no likely unit, chapter or topic headings were recognized. Use the CSV importer or another official syllabus document.');
  return {title:cleanTitle(decodeURIComponent(url.pathname.split('/').pop()||'')),sourceUrl:url.toString(),sourceHash:crypto.createHash('sha256').update(bytes).digest('hex'),pageCount:pdf.numPages,rows,reviewRequired:true,notice:'These are machine-extracted outline candidates. Verify every row and its page reference against the official PDF before saving as Draft.'};
 }catch(error){if((error as any)?.statusCode)throw error;throw fail('Could not parse this PDF. Use a text-based PDF; scanned image PDFs need OCR.');}
}
