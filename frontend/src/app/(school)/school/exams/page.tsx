'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSchoolExam, getClasses, getSchoolExams, getSubjects, updateSchoolExamStatus } from '@/services/schoolService';
import { SectionHeader, TableSkeleton, StatusBadge } from '@/components/ui/index';
import toast from 'react-hot-toast';

const errorText = e => e?.response?.data?.error?.message || e?.message || 'Request failed';
const blankQuestion = () => ({ questionText:'', optionA:'', optionB:'', optionC:'', optionD:'', correctOption:'A', explanation:'', difficulty:'MEDIUM' });

export default function SchoolExamsPage() {
  const qc = useQueryClient();
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({ title:'',classNames:[],subjectCodes:[],startTime:'',endTime:'',durationMins:45,marksPerQuestion:1,negativeMarks:0,status:'DRAFT',instructions:'',questions:[blankQuestion()] });
  const examsQ=useQuery({queryKey:['school-exams'],queryFn:()=>getSchoolExams().then(r=>r.data.data||[])});
  const classesQ=useQuery({queryKey:['school-classes'],queryFn:()=>getClasses().then(r=>r.data.data||[])});
  const subjectsQ=useQuery({queryKey:['school-subjects'],queryFn:()=>getSubjects().then(r=>r.data.data||[])});
  const classNames=useMemo(()=>[...new Set((classesQ.data||[]).map(c=>c.class_name))],[classesQ.data]);

  const create=useMutation({mutationFn:()=>createSchoolExam({
    ...form,
    startTime:new Date(form.startTime).toISOString(),endTime:new Date(form.endTime).toISOString(),
    totalQuestions:form.questions.length,
    questions:form.questions.map(q=>({...q,subjectCode:q.subjectCode||form.subjectCodes[0]})),
  }),onSuccess:async()=>{toast.success('School exam created');setShowForm(false);await qc.invalidateQueries({queryKey:['school-exams']});},onError:e=>toast.error(errorText(e))});
  const statusMut=useMutation({mutationFn:({id,status})=>updateSchoolExamStatus(id,status),onSuccess:async()=>{toast.success('Exam status updated');await qc.invalidateQueries({queryKey:['school-exams']});},onError:e=>toast.error(errorText(e))});

  function toggle(field,value){setForm(f=>({...f,[field]:f[field].includes(value)?f[field].filter(x=>x!==value):[...f[field],value]}));}
  function qChange(i,key,value){setForm(f=>({...f,questions:f.questions.map((q,x)=>x===i?{...q,[key]:value}:q)}));}
  function validateCreate(){if(!form.title||!form.startTime||!form.endTime||!form.classNames.length||!form.subjectCodes.length)return toast.error('Title, class, subject and exam time are required');if(form.questions.some(q=>!q.questionText||!q.optionA||!q.optionB||!q.optionC||!q.optionD))return toast.error('Complete every question and option');create.mutate();}

  const nextStatus={DRAFT:'REGISTRATION_OPEN',REGISTRATION_OPEN:'LIVE',LIVE:'COMPLETED'};
  return <div className="animate-fade-up">
    <SectionHeader title="📝 Exams" sub="Create and manage school tests, questions and publication status">
      <button className="btn-primary" onClick={()=>setShowForm(v=>!v)}>+ Create Exam</button>
    </SectionHeader>

    {showForm&&<div className="card mb-5" style={{border:'2px solid var(--saffron)'}}>
      <h3 className="font-display font-bold mb-4" style={{color:'var(--navy)'}}>New School Test</h3>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="md:col-span-2"><label className="text-xs font-bold block mb-1">Title</label><input className="input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Class 8 Science Unit Test"/></div>
        <div><label className="text-xs font-bold block mb-1">Start</label><input type="datetime-local" className="input" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))}/></div>
        <div><label className="text-xs font-bold block mb-1">End</label><input type="datetime-local" className="input" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))}/></div>
        <div><label className="text-xs font-bold block mb-1">Duration (minutes)</label><input type="number" min="1" max="300" className="input" value={form.durationMins} onChange={e=>setForm(f=>({...f,durationMins:Number(e.target.value)}))}/></div>
        <div><label className="text-xs font-bold block mb-1">Marks per question</label><input type="number" min="0.5" step="0.5" className="input" value={form.marksPerQuestion} onChange={e=>setForm(f=>({...f,marksPerQuestion:Number(e.target.value)}))}/></div>
      </div>
      <div className="mt-4"><label className="text-xs font-bold block mb-2">Eligible Classes</label><div className="flex flex-wrap gap-2">{classNames.map(c=><button type="button" key={c} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{background:form.classNames.includes(c)?'var(--navy)':'#F0F4F8',color:form.classNames.includes(c)?'white':'var(--slate)'}} onClick={()=>toggle('classNames',c)}>Class {c}</button>)}</div></div>
      <div className="mt-4"><label className="text-xs font-bold block mb-2">Subjects</label><div className="flex flex-wrap gap-2">{(subjectsQ.data||[]).map(s=><button type="button" key={s.code} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{background:form.subjectCodes.includes(s.code)?'var(--saffron)':'#F0F4F8',color:form.subjectCodes.includes(s.code)?'white':'var(--slate)'}} onClick={()=>toggle('subjectCodes',s.code)}>{s.name}</button>)}</div></div>
      <div className="mt-5"><div className="flex items-center justify-between"><h4 className="font-display font-bold" style={{color:'var(--navy)'}}>Questions ({form.questions.length})</h4><button className="btn-ghost text-xs" onClick={()=>setForm(f=>({...f,questions:[...f.questions,blankQuestion()]}))}>+ Add Question</button></div>
        <div className="space-y-3 mt-3">{form.questions.map((q,i)=><div className="p-4 rounded-xl" key={i} style={{background:'#F7F8FA'}}><div className="flex justify-between"><b className="text-sm">Q{i+1}</b>{form.questions.length>1&&<button className="text-xs" style={{color:'#C62828'}} onClick={()=>setForm(f=>({...f,questions:f.questions.filter((_,x)=>x!==i)}))}>Remove</button>}</div><input className="input mt-2" value={q.questionText} onChange={e=>qChange(i,'questionText',e.target.value)} placeholder="Question text"/><div className="grid sm:grid-cols-2 gap-2 mt-2">{['A','B','C','D'].map(opt=><input key={opt} className="input" value={q[`option${opt}`]} onChange={e=>qChange(i,`option${opt}`,e.target.value)} placeholder={`Option ${opt}`}/>)}</div><div className="flex gap-3 mt-2 items-center"><label className="text-xs font-bold">Correct:</label><select className="input select w-auto" value={q.correctOption} onChange={e=>qChange(i,'correctOption',e.target.value)}>{['A','B','C','D'].map(x=><option key={x}>{x}</option>)}</select><select className="input select w-auto" value={q.difficulty} onChange={e=>qChange(i,'difficulty',e.target.value)}>{['EASY','MEDIUM','HARD'].map(x=><option key={x}>{x}</option>)}</select></div></div>)}</div>
      </div>
      <div className="flex gap-2 mt-4"><button className="btn-primary" disabled={create.isPending} onClick={validateCreate}>{create.isPending?'Creating…':'Create Draft Exam'}</button><button className="btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button></div>
    </div>}

    <div className="card">{examsQ.isLoading?<TableSkeleton rows={6} cols={7}/>:<div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Exam</th><th>Classes</th><th>Subject</th><th>Questions</th><th>Attempts</th><th>Status</th><th>Action</th></tr></thead><tbody>{(examsQ.data||[]).map(e=><tr key={e.id}><td><b>{e.title}</b><div className="text-xs" style={{color:'var(--slate)'}}>{new Date(e.start_time).toLocaleString('en-IN')}</div></td><td>{(e.class_names||[]).join(', ')}</td><td>{(e.subject_codes||[]).join(', ')}</td><td>{e.question_count}/{e.total_questions}</td><td>{e.scored_attempts}</td><td><StatusBadge status={e.status}/></td><td>{nextStatus[e.status]?<button className="text-xs font-bold px-3 py-1 rounded-lg" style={{background:'var(--saffron-pale)',color:'var(--saffron)'}} disabled={statusMut.isPending} onClick={()=>statusMut.mutate({id:e.id,status:nextStatus[e.status]})}>{nextStatus[e.status].replaceAll('_',' ')}</button>:<span className="text-xs" style={{color:'var(--slate)'}}>—</span>}</td></tr>)}</tbody></table>{!(examsQ.data||[]).length&&<div className="py-10 text-center" style={{color:'var(--slate)'}}>No School exams created yet.</div>}</div>}</div>
  </div>;
}
