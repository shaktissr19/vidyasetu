'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChildren, getMessages, sendMessage } from '@/services/parentService';
import { SectionHeader } from '@/components/ui/index';
import { timeAgo } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import useAuthStore from '@/store/authStore';
import toast from 'react-hot-toast';

export default function MessagesPage() {
  const { t } = useLanguageStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectedChild, setSelectedChild] = useState(null);
  const [msgText, setMsgText] = useState('');
  const bottomRef = useRef(null);

  const { data: children = [] } = useQuery({
    queryKey: ['parent-children'],
    queryFn:  () => getChildren().then(r => r.data.data),
    onSuccess: d => { if (d.length && !selectedChild) setSelectedChild(d[0]?.id); },
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['parent-messages', selectedChild],
    queryFn:  () => getMessages(selectedChild).then(r => r.data.data),
    enabled:  !!selectedChild,
    refetchInterval: 15000,
  });

  const sendMut = useMutation({
    mutationFn: () => sendMessage(selectedChild, msgText),
    onSuccess:  () => { qc.invalidateQueries(['parent-messages', selectedChild]); setMsgText(''); },
    onError:    () => toast.error('Failed to send message'),
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="animate-fade-up flex flex-col h-[calc(100vh-62px-48px)]">
      <SectionHeader title={`💬 ${t('शिक्षक से संदेश', 'Message Teacher')}`} />

      {children.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {children.map(c => (
            <button key={c.id} onClick={() => setSelectedChild(c.id)}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{ background: selectedChild === c.id ? 'var(--forest)' : 'white', color: selectedChild === c.id ? 'white' : 'var(--slate)', border: `1.5px solid ${selectedChild === c.id ? 'var(--forest)' : 'var(--border)'}` }}>
              {c.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {selectedChild && (
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden" style={{ background: 'white', border: '1.5px solid var(--border)' }}>
          <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, var(--forest), var(--forest-light))', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xl" style={{ background: 'rgba(255,255,255,0.2)' }}>👩‍🏫</div>
            <div>
              <p className="font-bold text-sm text-white">{t('कक्षा शिक्षक', 'Class Teacher')}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{t('आमतौर पर 24 घंटे में जवाब देते हैं', 'Usually replies within 24 hours')}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {isLoading ? <div className="flex-1 flex items-center justify-center"><div className="text-sm" style={{ color: 'var(--slate)' }}>Loading...</div></div>
              : messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="text-4xl mb-3">💬</div>
                  <p className="font-semibold" style={{ color: 'var(--navy)' }}>{t('कोई संदेश नहीं', 'No messages yet')}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{t('शिक्षक को संदेश भेजें', 'Send a message to the teacher')}</p>
                </div>
              ) : messages.map((m, i) => {
                const isMe = m.sent_by === user?.id;
                return (
                  <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm mr-2 flex-shrink-0" style={{ background: 'var(--forest-pale)' }}>👩‍🏫</div>}
                    <div className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={isMe
                        ? { background: 'linear-gradient(135deg, var(--forest), var(--forest-light))', color: 'white', borderRadius: '14px 4px 14px 14px' }
                        : { background: '#F0F7F2', color: 'var(--navy)', borderRadius: '4px 14px 14px 14px' }}>
                      {m.body}
                      <p className="text-xs mt-1 opacity-60">{timeAgo(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 flex gap-2" style={{ borderTop: '1.5px solid var(--border)' }}>
            <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && msgText.trim() && sendMut.mutate()}
              placeholder={t('शिक्षक को संदेश लिखें...', 'Type a message to the teacher...')}
              className="input flex-1" />
            <button onClick={() => msgText.trim() && sendMut.mutate()} disabled={!msgText.trim() || sendMut.isPending}
              className="btn-green px-4" style={{ opacity: !msgText.trim() ? 0.5 : 1 }}>↗</button>
          </div>
        </div>
      )}
    </div>
  );
}
