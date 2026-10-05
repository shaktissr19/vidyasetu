import { createHash, randomUUID } from 'crypto';
import { query } from '../config/db';
import { s3, BUCKET, getDownloadUrl, deleteObject } from '../config/s3';
import { downloadLicensedAsset, scanImportedAsset } from './learningSourceAcquisition.service';
import { getStudentContext, canonicalGradeCode } from './studentCanonicalLearning.service';

const fail=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const maxBytes=25*1024*1024;
const officialSources=[
 {boardCode:'CBSE',name:'CBSE Academic curriculum',url:'https://cbseacademic.nic.in/curriculum_2027.html',note:'Current curriculum page; select the applicable class and subject PDF.'},
 {boardCode:'CISCE',name:'CISCE regulations and syllabus',url:'https://cisce.org/regulations-and-syllabus-icse-2027/',note:'ICSE subject syllabus pages; ISC documents are on the separate ISC page.'},
 {boardCode:'CISCE',name:'CISCE ISC regulations and syllabus',url:'https://cisce.org/regulations-and-syllabus-isc-2027/',note:'ISC subject syllabus pages.'},
 {boardCode:'UPMSP',name:'UPMSP syllabus',url:'https://upmsp.edu.in/Board_Syllabus.aspx',note:'Board syllabus downloads by class.'},
 {boardCode:'COMMON',name:'NCERT textbooks',url:'https://ncert.nic.in/textbook.php',note:'Reference textbooks; not a substitute for each board syllabus.'},
];

async function extractPdf(bytes:Buffer){
 if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')throw fail('The file is not a valid PDF.');
 try {
  // pdfjs-dist is ESM; load it dynamically because this backend is CommonJS.
  const dynamicImport=new Function('specifier','return import(specifier)') as (specifier:string)=>Promise<any>;
  const pdfjs=await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false,enableScripting:false});
  const doc=await loadingTask.promise;
  if(doc.numPages<1||doc.numPages>500){await loadingTask.destroy();throw fail('PDFs must contain 1–500 pages.');}
  const pages:string[]=[];let charCount=0;
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
   const page=await doc.getPage(pageNo);const content=await page.getTextContent();
   const text=content.items.map((x:any)=>typeof x.str==='string'?x.str:'').join(' ').replace(/\s+/g,' ').trim();
   charCount+=text.length;if(charCount>2_000_000){await loadingTask.destroy();throw fail('Extracted text exceeds the 2 MB review limit.');}
   if(text)pages.push(`Page ${pageNo}: ${text}`);
  }
  await loadingTask.destroy();
  const text=pages.join('\n');if(text.length<40)throw fail('This PDF has no usable embedded text. Scanned PDFs need OCR before they can be indexed.');
  const outline=pages.flatMap((line,index)=>{const page=Number(line.match(/^Page (\d+):/)?.[1]||index+1);const body=line.replace(/^Page \d+:\s*/, '');return body.split(/(?<=[.!?])\s+/).filter(s=>s.length>25).slice(0,30).map(candidate=>({page,text:candidate.slice(0,500)}));}).slice(0,3000);
  return {text,outline,pageCount:doc.numPages};
 }catch(e){if((e as any)?.statusCode)throw e;throw fail('Could not read this PDF. Upload a text-based PDF; scanned files require OCR.');}
}

async function save(input:{boardCode:string;academicYear:string;gradeCode?:string|null;subjectId?:string|null;title:string;language:string;sourceUrl:string;bytes:Buffer;actor:string;sourcePublisher?:string|null;redistributionAllowed?:boolean;redistributionEvidenceUrl?:string|null}){
 if(input.bytes.length>maxBytes)throw fail('PDF exceeds the 25 MB syllabus document limit.');
 const checksum=createHash('sha256').update(input.bytes).digest('hex');
 const parsed=await extractPdf(input.bytes);
 await scanImportedAsset(input.bytes);
 const {rows:[board]}=await query('SELECT id FROM education_boards WHERE code=$1 AND is_active=TRUE',[input.boardCode]);if(!board)throw fail('Choose an active education board.');
 const key=`syllabus/documents/${randomUUID()}.pdf`;
 await s3.putObject({Bucket:BUCKET,Key:key,Body:input.bytes,ContentType:'application/pdf',Metadata:{sha256:checksum}}).promise();
 try{
  const {rows:[row]}=await query(`INSERT INTO syllabus_documents(board_id,academic_year,grade_code,subject_id,title,language,source_url,source_publisher,source_checked_at,storage_key,checksum_sha256,byte_size,page_count,extracted_text,outline,redistribution_allowed,redistribution_evidence_url,rights_reviewed_by,rights_reviewed_at,uploaded_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13,$14::jsonb,FALSE,NULL,NULL,NULL,$15)
  ON CONFLICT(board_id,academic_year,checksum_sha256) DO NOTHING RETURNING id,status,page_count,created_at`,[board.id,input.academicYear,input.gradeCode||null,input.subjectId||null,input.title,input.language,input.sourceUrl,input.sourcePublisher||null,key,checksum,input.bytes.length,parsed.pageCount,parsed.text,JSON.stringify(parsed.outline),input.actor]);
  if(!row){await deleteObject(key).catch(()=>undefined);throw fail('This exact document is already in the library for this board and year.',409);}
  return {...row,outline:parsed.outline,extractedCharacters:parsed.text.length,redistributionAllowed:false};
 }catch(e){await deleteObject(key).catch(()=>undefined);throw e;}
}

export async function uploadSyllabusPdf(file:Express.Multer.File,meta:any,actor:string){
 if(!file)throw fail('Choose a PDF file.');
 if(file.mimetype!=='application/pdf'||file.buffer.subarray(0,5).toString()!=='%PDF-')throw fail('Upload a real PDF document.');
 return save({...meta,bytes:file.buffer,actor});
}
export async function importSyllabusPdf(meta:any,actor:string){
 const hosts=process.env.SYLLABUS_IMPORT_ALLOWED_HOSTS||'cbseacademic.nic.in,cisce.org,upmsp.edu.in,ncert.nic.in';
 const asset=await downloadLicensedAsset(meta.pdfUrl,'QUESTION_PAPER',hosts);
 if(asset.mime!=='application/pdf')throw fail('The official link did not return a PDF file. Paste a direct PDF link.');
 return save({...meta,sourceUrl:meta.pdfUrl,bytes:asset.bytes,actor});
}
export async function listSyllabusDocuments(filters:{boardCode?:string;gradeCode?:string;subjectId?:string;academicYear?:string;query?:string},student=false,studentUserId?:string){
 if(student){if(!studentUserId)throw fail('Student identity is required.',403);const context=await getStudentContext(studentUserId);if(!context.board_code)return [];filters={...filters,boardCode:context.board_code,gradeCode:canonicalGradeCode(context)};}
 const {rows}=await query(`SELECT d.id,eb.code AS board_code,eb.name AS board_name,d.academic_year,d.grade_code,g.name AS grade_name,d.subject_id,s.name AS subject_name,d.title,d.language,d.source_url,d.source_publisher,d.source_published_at,d.page_count,
 CASE WHEN $5::text IS NULL THEN '[]'::jsonb ELSE (SELECT COALESCE(jsonb_agg(hit.item),'[]'::jsonb) FROM (SELECT item FROM jsonb_array_elements(d.outline) AS e(item) WHERE item->>'text' ILIKE '%'||$5||'%' LIMIT 3) hit) END AS outline,
 d.status,d.redistribution_allowed,d.created_at
 FROM syllabus_documents d JOIN education_boards eb ON eb.id=d.board_id LEFT JOIN education_grade_levels g ON g.code=d.grade_code LEFT JOIN subjects s ON s.id=d.subject_id
 WHERE ($1::text IS NULL OR eb.code=$1) AND ($2::text IS NULL OR d.grade_code IS NULL OR d.grade_code=$2) AND ($3::uuid IS NULL OR d.subject_id=$3) AND ($4::text IS NULL OR d.academic_year=$4) AND ($5::text IS NULL OR d.extracted_text ILIKE '%'||$5||'%' OR d.title ILIKE '%'||$5||'%') AND (NOT $6 OR d.status='APPROVED') AND d.status<>'REJECTED'
 ORDER BY eb.sort_order,d.academic_year DESC,d.grade_code NULLS FIRST,s.name NULLS FIRST,d.title LIMIT 500`,[filters.boardCode||null,filters.gradeCode||null,filters.subjectId||null,filters.academicYear||null,filters.query?.slice(0,160)||null,student]);
 return rows;
}
export async function syllabusDocumentDetail(id:string,admin=false,studentUserId?:string){
 const {rows:[doc]}=await query('SELECT d.id,d.board_id,eb.code AS board_code,d.academic_year,d.grade_code,d.subject_id,d.title,d.language,d.source_url,d.source_publisher,d.page_count,d.outline,d.status,d.redistribution_allowed,d.redistribution_evidence_url,d.review_note,d.storage_key FROM syllabus_documents d JOIN education_boards eb ON eb.id=d.board_id WHERE d.id=$1::uuid',[id]);
 if(!doc)throw fail('Syllabus document not found.',404);
 if(!admin&&doc.status!=='APPROVED')throw fail('Syllabus document not found.',404);
 if(!admin){if(!studentUserId)throw fail('Student identity is required.',403);const context=await getStudentContext(studentUserId);if(!context.board_code||doc.board_code!==context.board_code||(doc.grade_code&&doc.grade_code!==canonicalGradeCode(context)))throw fail('Syllabus document not found.',404);}
 const {storage_key,...safeDoc}=doc;
 return {...safeDoc,downloadUrl:admin||doc.redistribution_allowed?await getDownloadUrl(storage_key,admin?600:300):null};
}
export async function reviewSyllabusDocument(id:string,input:{status:'APPROVED'|'REJECTED';note:string;redistributionAllowed:boolean;redistributionEvidenceUrl?:string|null},actor:string){
 if(input.redistributionAllowed&&!input.redistributionEvidenceUrl)throw fail('Add evidence of redistribution rights before enabling student PDF downloads.');
 const {rows:[r]}=await query(`UPDATE syllabus_documents SET status=$2,review_note=$3,reviewed_by=$4::uuid,reviewed_at=NOW(),redistribution_allowed=$5,redistribution_evidence_url=CASE WHEN $5 THEN $6 ELSE NULL END,rights_reviewed_by=CASE WHEN $5 THEN $4::uuid ELSE NULL END,rights_reviewed_at=CASE WHEN $5 THEN NOW() ELSE NULL END WHERE id=$1::uuid RETURNING id,status,reviewed_at,redistribution_allowed`,[id,input.status,input.note,actor,input.redistributionAllowed,input.redistributionEvidenceUrl||null]);
 if(!r)throw fail('Syllabus document not found.',404);
 await query("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,new_value) VALUES($1::uuid,'UPDATE','syllabus_document',$2::uuid,$3::jsonb)",[actor,id,JSON.stringify({status:r.status,note:input.note,redistributionAllowed:r.redistribution_allowed,rightsEvidenceUrl:input.redistributionAllowed?input.redistributionEvidenceUrl:null})]);
 return r;
}
export function syllabusSourceDirectory(){return officialSources;}
