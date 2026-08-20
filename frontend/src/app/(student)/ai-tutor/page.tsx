'use client';
import { useState, useRef, useEffect } from 'react';
import { chat } from '@/services/aiService';
import useLanguageStore from '@/store/languageStore';
import type { StudentChatMessage } from '@/types/studentPortal';
import toast from 'react-hot-toast';

const QUICK_PROMPTS = [
  { hi: 'प्रकाश परावर्तन समझाओ', en: 'Explain light reflection' },
  { hi: 'द्विघात समीकरण हल करो', en: 'Solve quadratic equations' },
  { hi: 'प्रकाश संश्लेषण क्या है?', en: 'What is photosynthesis?' },
  { hi: 'फ्रांसीसी क्रांति के कारण', en: 'Causes of French Revolution' },
];

export default function AITutorPage() {
  const { t, lang } = useLanguageStore();
  const [messages, setMessages] = useState<StudentChatMessage[]>([
    { role: 'assistant', content: 'Namaste! 🙏 Main VidyaBot hoon — aapka AI tutor. Koi bhi sawaal poochho Mathematics, Science, English ya Social Science ke baare mein. Main Hindi ya English mein samjhaunga!' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string): Promise<void> {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');

    const userMsg: StudentChatMessage = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.slice(-10);
      const { data } = await chat(msg, history);
      setMessages(prev => [...prev, { role: 'assistant', content: String(data.data.response) }]);
    } catch (error: unknown) {
      toast.error(t('जवाब नहीं मिला। दोबारा कोशिश करें।', 'Could not get a response. Try again.'));
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-up max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>
          🤖 {t('AI टीचर — VidyaBot', 'AI Tutor — VidyaBot')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
          {t('हिंदी या अंग्रेज़ी में पूछो — NCERT Class 1–12', 'Ask in Hindi or English — NCERT Class 1–12')}
        </p>
      </div>

      <div className="card flex flex-col" style={{ height: '58vh' }}>
        <div className="flex items-center gap-3 pb-4 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))' }}>🤖</div>
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--navy)' }}>VidyaBot</p>
            <p className="text-xs" style={{ color: 'var(--forest)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />
              {loading ? t('सोच रहा हूँ...', 'Thinking...') : t('ऑनलाइन', 'Online')}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                style={m.role === 'user'
                  ? { background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', color: 'white', borderRadius: '16px 4px 16px 16px' }
                  : { background: 'var(--saffron-pale)', color: 'var(--navy)', borderRadius: '4px 16px 16px 16px' }}>
                <span dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: 'var(--saffron-pale)', borderRadius: '4px 16px 16px 16px' }}>
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 rounded-full bg-saffron-400 animate-pulse-soft" style={{ animationDelay: `${i * 0.2}s`, background: 'var(--saffron)' }} />
                  ))}
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <input
            className="input flex-1"
            placeholder={t('हिंदी या English में पूछो...', 'Ask in Hindi or English...')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            disabled={loading}
          />
          <button className="btn-primary px-4 flex-shrink-0" onClick={() => void send()} disabled={loading || !input.trim()}>↗</button>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--slate)' }}>{t('जल्दी पूछो:', 'Quick ask:')}</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((p, i) => (
            <button key={i} className="text-xs px-3 py-1.5 rounded-full font-medium transition-all hover:opacity-80"
              style={{ background: 'white', border: '1.5px solid var(--border)', color: 'var(--navy)' }}
              onClick={() => void send(lang === 'hi' ? p.hi : p.en)}>
              {lang === 'hi' ? p.hi : p.en}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
