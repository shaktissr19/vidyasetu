import axios, { type AxiosRequestConfig } from 'axios';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import { Agent } from 'https';
import { isIP } from 'net';

const fail=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
function hasStatusCode(error:unknown):error is Error&{statusCode:number}{return error instanceof Error&&'statusCode' in error&&typeof error.statusCode==='number';}
const maxHtmlBytes=2_000_000;
const maxPdfBytes=25*1024*1024;
const allowedHosts=()=> (process.env.SYLLABUS_IMPORT_ALLOWED_HOSTS||'cbseacademic.nic.in,cisce.org,upmsp.edu.in,ncert.nic.in,nios.ac.in').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
function publicAddress(address:string){if(isIP(address)!==4)return false;const [a,b]=address.split('.').map(Number);return a!==0&&a!==10&&a!==127&&a<224&&a!==169&&a!==192&&!(a===172&&b>=16&&b<=31)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19||b===51))&&!(a===203&&b===0);}
async function getOfficial<T>(url:URL,config:AxiosRequestConfig){const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw fail('Official source host resolves to a private or unsupported IP address.',403);const address=addresses[0].address;const agent=new Agent({family:4,lookup:(_host,_options,callback)=>callback(null,address,4)});try{return await axios.get<T>(url.toString(),{...config,httpsAgent:agent,proxy:false,maxRedirects:0});}finally{agent.destroy();}}
const boardSourceHosts:Record<string,string[]>={CBSE:['cbseacademic.nic.in','ncert.nic.in'],CISCE:['cisce.org'],UPMSP:['upmsp.edu.in'],NIOS:['nios.ac.in']};
function checkedOfficialUrl(value:string,base?:string,boardCode?:string){
 let url:URL;try{url=new URL(value,base);}catch{throw fail('The source URL is invalid.');}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(host)||!allowedHosts().some(x=>host===x||host.endsWith(`.${x}`))) throw fail('Only standard-port HTTPS URLs on approved official board domains can be fetched.');
 if(boardCode){const expected=boardSourceHosts[boardCode.toUpperCase()];if(!expected||!expected.some(x=>host===x||host.endsWith(`.${x}`)))throw fail(`No official-source connector is configured for ${boardCode}. Configure its board-specific source before fetching.`);}
 return url;
}
function cleanTitle(value:string){return value.replace(/\.(pdf|html?)($|\?.*)/i,'').replace(/[+_]/g,' ').replace(/\s+/g,' ').trim().slice(0,240)||'Official curriculum document';}
function subjectMatches(text:string,subject:string){const normalized=subject.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const searchable=text.toLowerCase().replace(/[_-]+/g,' ');const aliases:Record<string,string[]>={mathematics:['mathematics','maths','math'],maths:['mathematics','maths','math'],math:['mathematics','maths','math'],'social science':['social science','social sciences','social studies'],'social studies':['social science','social sciences','social studies'],science:['science','general science'],english:['english'],hindi:['hindi'],'skill education':['skill education','kaushal bodh'],'vocational education':['vocational education','kaushal bodh']};const terms=aliases[normalized]||[normalized];return terms.some(term=>term&&searchable.includes(term));}
const romanClasses:Record<string,number>={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12};
function classCode(value:string|undefined){if(!value)return null;const key=value.toUpperCase();const numeric=romanClasses[key]||Number(key);return Number.isInteger(numeric)&&numeric>=1&&numeric<=12?`CLASS_${numeric}`:null;}
function inferClass(text:string){
 const kaushalBodh=text.match(/kaushal[_ -]?bodh[_ -]?(vi{1,3}|[6-8])(?:\b|[_\-.])/i);
 if(kaushalBodh)return classCode(kaushalBodh[1]);
 const early=text.match(/\b(pre[- ]?nursery|nursery|lkg|ukg)\b/i)?.[1]?.toLowerCase().replace(/\s+/g,'-');
 if(early)return ({'pre-nursery':'PRE_NURSERY',nursery:'NURSERY',lkg:'LKG',ukg:'UKG'} as Record<string,string>)[early]||null;
 const match=text.match(/(?:class|grade|standard|std)[\s_()\-–]*(xii|xi|x|ix|viii|vii|vi|iv|v|iii|ii|i|1[0-2]|[1-9])\b/i)
  || text.match(/(?:secp(?:art)?\d*)[\s_()\-–]*(xii|xi|x|ix|viii|vii|vi|iv|v|iii|ii|i|1[0-2]|[1-9])(?:\b|[_\-.])/i);
 return classCode(match?.[1]);
}
function inferSubject(text:string){const value=text.toLowerCase();const subjects:[string,RegExp][]=[['Mathematics',/\b(mathematics|maths)\b/],['Science',/\bscience\b/],['Social Science',/\b(social science|social studies)\b/],['English',/\benglish\b/],['Hindi',/\bhindi\b/],['Physics',/\bphysics\b/],['Chemistry',/\bchemistry\b/],['Biology',/\bbiology\b/],['Computer Science',/\b(computer science|informatics)\b/],['Economics',/\beconomics\b/],['History',/\bhistory\b/],['Geography',/\bgeography\b/],['Accountancy',/\baccountancy\b/],['Business Studies',/\bbusiness studies\b/]];return subjects.find(([,pattern])=>pattern.test(value))?.[0]||null;}

export interface DiscoveredSyllabusDocument {title:string;url:string;sourceHost:string;classGuess:string|null;subjectGuess:string|null;}
export function parseOfficialSyllabusIndex(sourceUrl:string,html:string,input:{boardCode:string;classCode?:string;subject?:string}){
 const source=checkedOfficialUrl(sourceUrl,undefined,input.boardCode);
 const links=new Map<string,DiscoveredSyllabusDocument>();
 const anchor=/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
 let match:RegExpExecArray|null;
 while((match=anchor.exec(html))){
  const raw=(match[1]||match[2]||match[3]||'').replace(/&amp;/g,'&');if(!/\.pdf(?:[?#]|$)/i.test(raw))continue;
  let url:URL;try{url=checkedOfficialUrl(raw,source.toString(),input.boardCode);}catch{continue;}if(url.hostname!==source.hostname&&!url.hostname.endsWith(`.${source.hostname}`))continue;
  let title=cleanTitle(match[4].replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/g,'&'));
  // Several official indexes use a generic “Download” label and put the
  // actual class/subject in the PDF filename. Prefer that filename for review.
  if(/^(download|download now|click here|डाउनलोड करें|डाउनलोड|vi|vii|viii)$/i.test(title))title=cleanTitle(decodeURIComponent(url.pathname.split('/').pop()||''));
  const preceding=html.slice(0,match.index);const headings=[...preceding.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi)];const sectionHeading=headings.at(-1)?.[1].replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ')||'';
  // Infer class from the PDF filename, not its containing directory. CBSE's
  // 2026-27 index stores Class IX/X PDFs under `SecPart1/`; interpreting that
  // directory name as a grade incorrectly turns both classes into Class 1.
  const filename=decodeURIComponent(url.pathname.split('/').pop()||'');
  const text=`${title} ${filename} ${sectionHeading}`;
  const guessedClass=inferClass(text);const guessedSubject=inferSubject(text);
  const niosCourseIndex=input.boardCode.toUpperCase()==='NIOS'&&source.hostname.endsWith('.nios.ac.in');
  // NIOS course-material indexes are level-scoped (Secondary/Senior Secondary)
  // rather than class-scoped; keep their unlabelled course PDFs for explicit
  // admin scope confirmation, while still excluding positively mismatched PDFs.
  if(input.classCode&&guessedClass&&guessedClass!==input.classCode)continue;
  if(input.classCode&&!guessedClass&&!niosCourseIndex)continue;
  if(input.subject&&!subjectMatches(text,input.subject))continue;
  links.set(url.toString(),{title,url:url.toString(),sourceHost:url.hostname,classGuess:guessedClass,subjectGuess:input.subject&&subjectMatches(text,input.subject)?input.subject:guessedSubject});
 }
 const documents=[...links.values()].slice(0,250);
 return {sourceUrl:source.toString(),sourceHost:source.hostname,documents};
}
export async function discoverOfficialSyllabusDocuments(input:{boardCode:string;sourceUrl:string;academicYear:string;classCode:string;subject?:string}){
 const source=checkedOfficialUrl(input.sourceUrl,undefined,input.boardCode);
 if(!input.classCode)throw fail('Select a class before fetching. Automatic syllabus discovery is always limited to one class so results from another class cannot be mixed in.');
 // The currently configured CBSE page publishes the secondary/senior-secondary
 // index. Do not turn a known gap for Classes 1–8 into a misleading “no match”.
 const sourcePath=source.pathname.toLowerCase();
 const supportedGrades= input.boardCode.toUpperCase()==='CBSE'&&sourcePath.endsWith('/curriculum_2027.html')?['CLASS_9','CLASS_10','CLASS_11','CLASS_12']
  :input.boardCode.toUpperCase()==='CBSE'&&sourcePath.endsWith('/skill-education-curriculum.html')?['CLASS_6','CLASS_7','CLASS_8','CLASS_9','CLASS_10','CLASS_11','CLASS_12']
  :input.boardCode.toUpperCase()==='CISCE'&&sourcePath.endsWith('/icse-regulations-and-syllabuses-2027/')?['CLASS_9','CLASS_10']
  :input.boardCode.toUpperCase()==='CISCE'&&sourcePath.endsWith('/isc-regulations-and-syllabuses-2027/')?['CLASS_11','CLASS_12']
  :input.boardCode.toUpperCase()==='UPMSP'&&sourcePath.endsWith('/board_syllabus.aspx')?['CLASS_9','CLASS_10','CLASS_11','CLASS_12']
  :input.boardCode.toUpperCase()==='NIOS'&&source.hostname==='rchyderabad.nios.ac.in'&&sourcePath.endsWith('/secondary-courses-material.html')?['CLASS_9','CLASS_10']
  :input.boardCode.toUpperCase()==='NIOS'&&source.hostname==='rcpune.nios.ac.in'&&sourcePath.endsWith('/senior-secondary-courses-material.html')?['CLASS_11','CLASS_12']
  :null;
 if(supportedGrades&&input.classCode&&!supportedGrades.includes(input.classCode)){
  const scope=input.classCode.replace('CLASS_','Class ');
  const covered=supportedGrades.map(value=>value.replace('CLASS_','')).join(', ');
  return {sourceUrl:source.toString(),sourceHost:source.hostname,documents:[],outcome:'UNSUPPORTED_SCOPE' as const,message:`Automatic discovery from this official index is configured for Classes ${covered}. ${scope} is not covered by this connector. No PDFs were fetched. Load a verified official PDF or import a reviewed syllabus index spreadsheet for this class.`};
 }
 const isCurrentCbseIndex=input.boardCode.toUpperCase()==='CBSE'&&(
  sourcePath.endsWith('/curriculum_2027.html')||sourcePath.endsWith('/skill-education-curriculum.html')
 );
 if(isCurrentCbseIndex&&input.academicYear!=='2026-27'){
  return {sourceUrl:source.toString(),sourceHost:source.hostname,documents:[],outcome:'UNSUPPORTED_SCOPE' as const,message:`This CBSE source is verified for academic year 2026-27, not ${input.academicYear}. No PDFs were fetched. Choose the matching official source for that year.`};
 }
 let response;
 try{response=await getOfficial<string>(source,{timeout:15000,maxContentLength:maxHtmlBytes,maxBodyLength:maxHtmlBytes,responseType:'text',headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'VidyaSetu-SyllabusImporter/2.0'}});}catch(error){if(hasStatusCode(error))throw error;throw fail('Could not fetch the official syllabus index. No PDFs were fetched. Check the URL and try again.',502);}
 if(typeof response.data!=='string'||!/^text\/html|^application\/xhtml\+xml/i.test(String(response.headers['content-type']||''))) throw fail('The selected source is not an HTML index page. Paste the official index page URL, not a PDF URL.');
 const result=parseOfficialSyllabusIndex(source.toString(),response.data,input);
 if(!result.documents.length){const scope=[input.classCode?input.classCode.replace('CLASS_','Class '):'all classes',input.subject||'all subjects'].join(' · ');return {...result,outcome:'NO_MATCH' as const,message:`No matching syllabus PDF was found in the selected ${input.boardCode} source for ${scope}. The syllabus may be absent from this index, or its links may use a format the importer cannot read. No PDFs were fetched. Verify the source or load the official PDF manually.`};}
 return {...result,outcome:'FOUND' as const};
}

export interface ExtractedOutlineRow {unit:string;chapter:string;topic:string;pageReference:string;confidence:'high'|'review';}
interface PdfTextItem {str?:unknown;transform?:ArrayLike<number>;}
interface PdfJsPage {getTextContent():Promise<{items:unknown[]}>;}
interface PdfJsDocument {numPages:number;getPage(pageNumber:number):Promise<PdfJsPage>;}
interface PdfJsLoadingTask {promise:Promise<PdfJsDocument>;destroy():Promise<void>;}
interface PdfJsModule {getDocument(options:{data:Uint8Array;useSystemFonts:boolean;isEvalSupported:boolean;enableScripting:boolean}):PdfJsLoadingTask;}
interface PositionedPart {x:number;text:string;}
interface LayoutLine {page:number;y:number;parts:PositionedPart[];text:string;}
function layoutLines(items:unknown[],page:number){
 const values=(items as PdfTextItem[]).filter(item=>typeof item?.str==='string'&&item.str.trim()).map(item=>({x:Number(item.transform?.[4]||0),y:Number(item.transform?.[5]||0),text:String(item.str).trim()})).sort((a,b)=>b.y-a.y||a.x-b.x);
 const groups:Array<{y:number;parts:PositionedPart[]}>=[];
 for(const item of values){let group=groups.find(candidate=>Math.abs(candidate.y-item.y)<=2);if(!group){group={y:item.y,parts:[]};groups.push(group);}group.parts.push({x:item.x,text:item.text});}
 return groups.sort((a,b)=>b.y-a.y).map(group=>{const parts=group.parts.sort((a,b)=>a.x-b.x);return {page,y:group.y,parts,text:parts.map(item=>item.text).join(' ').replace(/\s+/g,' ').trim()};}).filter(line=>line.text.length>2&&line.text.length<500);
}
function stripIndex(line:string){return line.replace(/^\s*(?:(?:unit|chapter|part)\s+[ivxlcdm\d]+\s*[:.\-–)]?\s*|\d+(?:\.\d+)*\s*[.):\-–]?\s*|[A-Z]\s*[.):\-–]\s*)/i,'').trim();}
export function parseCurriculumOutline(pages:Array<{page:number;lines:string[]}>):ExtractedOutlineRow[]{
 const rows:ExtractedOutlineRow[]=[];let unit='Curriculum';let chapter='Topics';let pendingChapter:{unit:string;chapter:string;pageReference:string}|null=null;let chapterHasTopics=false;
 const flushChapter=()=>{if(pendingChapter&&!chapterHasTopics)rows.push({unit:pendingChapter.unit,chapter:pendingChapter.chapter,topic:pendingChapter.chapter,pageReference:pendingChapter.pageReference,confidence:'review'});pendingChapter=null;chapterHasTopics=false;};
 const seen=new Set<string>();
 for(const page of pages){for(const raw of page.lines){const line=raw.replace(/\s+/g,' ').trim();const unitHeading=/^(unit|part)\s+([ivxlcdm\d]+)\s*[:.\-–)]?\s*(.*)$/i.exec(line);if(unitHeading){flushChapter();unit=`${unitHeading[1][0].toUpperCase()}${unitHeading[1].slice(1)} ${unitHeading[2]}${unitHeading[3]?` · ${unitHeading[3]}`:''}`;chapter=stripIndex(unitHeading[3]||unit);continue;}const chapterHeading=/^(chapter\s+[ivxlcdm\d]+\s*[:.\-–)]?\s*.+|\d+(?:\.\d+)?\s*[.):\-–]\s*[A-Z][^.!?]{2,100})$/i.test(line);const topicHeading=/^(?:topics?\s*[:\-–]|\d+\.\d+\s+|[•●▪◦*\-]\s+|[a-z]\)\s+)/i.test(line);const contentsLabel=/^(?:contents|index|syllabus|learning outcomes?|curricular objectives?|course structure)$/i.test(line);if(contentsLabel||line.length>190||/^(?:page\s+\d+|www\.|https?:|©|copyright)/i.test(line))continue;if(chapterHeading){const next=stripIndex(line);if(next.length>2&&next.length<180&&next.toLowerCase()!==chapter.toLowerCase()){flushChapter();chapter=next;pendingChapter={unit,chapter,pageReference:`Page ${page.page}`};}continue;}if(topicHeading){const topic=stripIndex(line.replace(/^(?:topics?\s*[:\-–]|[•●▪◦*\-]\s+)/i,''));if(topic.length<4)continue;const key=`${unit}|${chapter}|${topic}`.toLowerCase();chapterHasTopics=true;if(!seen.has(key)){rows.push({unit,chapter,topic,pageReference:`Page ${page.page}`,confidence:/^\d/.test(line)?'high':'review'});seen.add(key);}}}}
 flushChapter();return rows.slice(0,5000);
}
export function parseKeyConceptTable(lines:LayoutLine[]){
 const rows:ExtractedOutlineRow[]=[];let unit='Curriculum';let chapter='';let topic='';let topicPage=0;let readingCourseTable=false;
 const seen=new Set<string>();
 const finish=()=>{const clean=topic.replace(/\s+/g,' ').replace(/[.;:]$/,'').trim();if(chapter&&clean.length>=3&&clean.length<=220&&!/^the student will/i.test(clean)){const key=`${unit}|${chapter}|${clean}`.toLowerCase();if(!seen.has(key)){rows.push({unit,chapter:chapter.replace(/\s+/g,' ').trim().slice(0,220),topic:clean,pageReference:`Page ${topicPage}`,confidence:'high'});seen.add(key);}}topic='';};
 const columnText=(line:LayoutLine,min:number,max:number)=>line.parts.filter(part=>part.x>=min&&part.x<max&&!/^[•●▪◦*\-]$/.test(part.text)).map(part=>part.text).join(' ').replace(/\s+/g,' ').trim();
 for(const line of lines){
  const unitMatch=line.text.match(/\bUNIT\s+([IVXLCDM\d]+)\s*:\s*([^|]{2,120})/i);if(unitMatch){finish();unit=`Unit ${unitMatch[1]} · ${unitMatch[2].replace(/No\. of periods.*$/i,'').trim()}`;chapter='';readingCourseTable=true;continue;}
  if(/Chapter\s*Name/i.test(line.text)&&/Key\s*Concepts/i.test(line.text))continue;
  if(!readingCourseTable)continue;
  // In CBSE's current table, chapter serials are around x=69 and titles
  // begin at x=104. Topic serials are around x=109 and their text at x=127.
  // Competencies/explanations start at x≈280, so exclude those columns.
  const chapterSerial=line.parts.find(part=>part.x<95&&/^\d{1,2}\.?$/.test(part.text));
  const topicSerial=line.parts.find(part=>part.x>=95&&part.x<120&&/^\d{1,2}\.?$/.test(part.text));
  if(chapterSerial){finish();chapter=columnText(line,95,280);if(chapter.length>220)chapter=chapter.slice(0,220);continue;}
  if(topicSerial){finish();topic=columnText(line,120,280);topicPage=line.page;continue;}
  const continuation=columnText(line,120,280);
  if(topic&&continuation)topic=`${topic} ${continuation}`.trim();
  else if(chapter&&!topic){const chapterContinuation=columnText(line,95,280);if(chapterContinuation)chapter=`${chapter} ${chapterContinuation}`.trim();}
 }
 finish();return rows;
}
function parseCourseStructure(lines:LayoutLine[]){
 const chapters:Array<{unit:string;chapter:string}>=[];let active=false;let unit='Curriculum';let chapter='';
 const finish=()=>{const value=chapter.replace(/\s+/g,' ').replace(/\b([A-Za-z]{3,})\s+s\b/g,'$1s').trim();if(value.length>2)chapters.push({unit,chapter:value});chapter='';};
 for(const line of lines){if(/COURSE STRUCTURE CLASS/i.test(line.text)){active=true;continue;}if(!active)continue;if(/^Total\b/i.test(line.text)){finish();break;}
  const roman=line.parts.find(part=>part.x<110&&/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/.test(part.text));
  const unitText=line.parts.filter(part=>part.x>=110&&part.x<240).map(part=>part.text).join(' ').trim();
  if(roman){finish();unit=`Unit ${roman.text}${unitText?` · ${unitText}`:''}`;}else if(unitText&&!line.parts.some(part=>part.x>=220&&part.x<280&&/^[•●▪◦*\-]$/.test(part.text)))unit=`${unit} ${unitText}`.replace(/\s+/g,' ').trim();
  const bullet=line.parts.find(part=>part.x>=220&&part.x<280&&/^[•●▪◦*\-]$/.test(part.text));const chapterText=line.parts.filter(part=>part.x>=260&&part.x<480&&!/^[•●▪◦*\-]$/.test(part.text)).map(part=>part.text).join(' ').trim();
  if(bullet){finish();chapter=chapterText;}else if(chapter&&chapterText)chapter=`${chapter} ${chapterText}`;
 }
 return chapters;
}
function alignChapters(rows:ExtractedOutlineRow[],course:Array<{unit:string;chapter:string}>){
 const words=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(word=>word.length>1));const unitKey=(value:string)=>value.match(/\b(?:unit)\s+([ivxlcdm\d]+)/i)?.[1]?.toUpperCase();
 return rows.map(row=>{const source=words(row.chapter);let best:{unit:string;chapter:string}|undefined;let score=0;for(const candidate of course){if(unitKey(row.unit)&&unitKey(candidate.unit)&&unitKey(row.unit)!==unitKey(candidate.unit))continue;const target=words(candidate.chapter);const overlap=[...source].filter(word=>target.has(word)).length;const value=overlap/Math.max(1,Math.min(source.size,target.size));if(value>score){score=value;best=candidate;}}return best&&score>=0.45?{...row,unit:best.unit,chapter:best.chapter}:row;});
}
export interface ParsedSyllabusPdf {title:string;sourceUrl:string|null;sourceHash:string;pageCount:number;rows:ExtractedOutlineRow[];fullText:string;outline:Array<{page:number;text:string}>;detectedGradeCode:string|null;detectedSubject:string|null;reviewRequired:true;notice:string;}
export async function extractSyllabusPdfBytes(bytes:Buffer,sourceUrl:string|null,displayName='Official curriculum document'):Promise<ParsedSyllabusPdf>{
 if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')throw fail('The selected file is not a valid PDF.');
 try{
  const dynamicImport=new Function('specifier','return import(specifier)') as (specifier:string)=>Promise<unknown>;
  const imported=await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');if(!imported||typeof imported!=='object'||!('getDocument' in imported)||typeof imported.getDocument!=='function')throw new Error('Invalid PDF parser module');
  const pdfjs=imported as PdfJsModule;const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false,enableScripting:false});const pdf=await task.promise;
  if(pdf.numPages<1||pdf.numPages>500){await task.destroy();throw fail('PDFs must contain 1–500 pages.');}
  const layout:LayoutLine[]=[];let chars=0;
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo);const content=await page.getTextContent();const lines=layoutLines(content.items,pageNo);chars+=lines.reduce((sum,line)=>sum+line.text.length,0);if(chars>2_000_000){await task.destroy();throw fail('Extracted PDF text exceeds the 2 MB review limit.');}layout.push(...lines);}
  await task.destroy();if(chars<40)throw fail('This PDF has no extractable text; OCR is needed before this source can be imported.');
  const pageGroups=new Map<number,string[]>();for(const line of layout){const values=pageGroups.get(line.page)||[];values.push(line.text);pageGroups.set(line.page,values);}
  const generic=parseCurriculumOutline([...pageGroups].map(([page,lines])=>({page,lines})));
  const table=parseKeyConceptTable(layout);const course=parseCourseStructure(layout);
  const rows=(table.length>=3?alignChapters(table,course):generic).slice(0,5000);if(!rows.length)throw fail('The PDF was read, but no likely unit, chapter or topic headings were recognized. Use the spreadsheet importer or correct the structure manually.');
  const fullText=[...pageGroups].map(([page,lines])=>`Page ${page}: ${lines.join(' ')}`).join('\n');const scopeText=`${displayName} ${sourceUrl||''} ${fullText.slice(0,15000)}`;
  return {title:cleanTitle(displayName),sourceUrl,sourceHash:createHash('sha256').update(bytes).digest('hex'),pageCount:pdf.numPages,rows,fullText,outline:rows.map(row=>({page:Number(row.pageReference.match(/\d+/)?.[0]||1),text:`${row.unit} › ${row.chapter} › ${row.topic}`})),detectedGradeCode:inferClass(scopeText),detectedSubject:inferSubject(scopeText),reviewRequired:true,notice:'A structured Draft was created from machine-extracted headings. Verify every unit, chapter, topic and page reference before review.'};
 }catch(error){if(hasStatusCode(error))throw error;throw fail('Could not parse this PDF. Use a text-based PDF; scanned image PDFs need OCR.');}
}
export async function extractOfficialSyllabusOutline(pdfUrl:string,boardCode:string){
 const url=checkedOfficialUrl(pdfUrl,undefined,boardCode);let response;
 try{response=await getOfficial<ArrayBuffer>(url,{timeout:45000,maxContentLength:maxPdfBytes,maxBodyLength:maxPdfBytes,responseType:'arraybuffer',headers:{Accept:'application/pdf','User-Agent':'VidyaSetu-SyllabusImporter/2.0'}});}catch(error){if(hasStatusCode(error))throw error;throw fail('Could not download the official PDF. It may require a browser session or direct download access.',502);}
 const bytes=Buffer.from(response.data);return extractSyllabusPdfBytes(bytes,url.toString(),decodeURIComponent(url.pathname.split('/').pop()||''));
}
