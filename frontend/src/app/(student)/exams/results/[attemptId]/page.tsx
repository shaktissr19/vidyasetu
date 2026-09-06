'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getCompetitionResult } from '@/services/competitionService';
import { apiErrorText } from '@/utils/errors';
import useLanguageStore from '@/store/languageStore';

export default function CompetitionResultPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = typeof params?.attemptId === 'string' ? params.attemptId : '';
  const { lang, t } = useLanguageStore();
  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: ['competition-official-result', attemptId],
    queryFn: () => getCompetitionResult(attemptId).then((response) => response.data.data),
    enabled: Boolean(attemptId),
    retry: false,
  });

  if (isLoading) return <div className="card" style={{ padding: 32 }}>{t('आधिकारिक परिणाम स्थिति देखी जा रही है…', 'Checking official result status…')}</div>;
  if (error || !result) {
    return (
      <div className="card" style={{ padding: 32 }}>
        <h1 className="font-display font-extrabold text-xl" style={{ color: 'var(--navy)' }}>{t('परिणाम उपलब्ध नहीं है', 'Result unavailable')}</h1>
        <p style={{ color: 'var(--slate)', marginTop: 8 }}>{apiErrorText(error, 'This competition result could not be loaded.')}</p>
        <Link href="/exams" className="btn-primary" style={{ display: 'inline-flex', marginTop: 16 }}>{t('मेरी प्रतियोगिताएँ', 'My competitions')}</Link>
      </div>
    );
  }

  if (!result.released) {
    return (
      <div className="card" style={{ maxWidth: 760, margin: '24px auto', padding: 36, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>⏳</div>
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)', marginTop: 8 }}>{t('आधिकारिक परिणाम का इंतज़ार', 'Awaiting official results')}</h1>
        <p style={{ color: 'var(--slate)', marginTop: 10 }}>{result.message || t('स्कोर, रैंक और सीखने की प्रतिक्रिया परिणाम जारी होने पर दिखाई देगी।', 'Score, rank and learning feedback will appear when results are officially released.')}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <button className="btn-primary" onClick={() => void refetch()}>{t('फिर जाँचें', 'Check again')}</button>
          <Link href="/exams" className="btn-outline">{t('मेरी प्रतियोगिताएँ', 'My competitions')}</Link>
        </div>
      </div>
    );
  }

  const concepts = result.conceptFeedback || [];
  const review = result.questionReview || [];
  const title = lang === 'hi' && result.titleHi ? result.titleHi : result.title;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 16 }}>
      <section className="card" style={{ padding: 28, background: 'linear-gradient(135deg,#0D1B3E,#17396F)', color: 'white' }}>
        <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 13 }}>{t('आधिकारिक प्रतियोगिता परिणाम', 'Official competition result')}</div>
        <h1 className="font-display font-extrabold text-2xl" style={{ marginTop: 5 }}>{title}</h1>
        {result.integrityStatus === 'FLAGGED' && (
          <div style={{ marginTop: 12, borderRadius: 10, padding: 10, background: 'rgba(255,190,80,.16)', color: '#FFD79A' }}>
            {t('यह प्रयास इंटीग्रिटी समीक्षा के लिए फ़्लैग है। रैंक/पुरस्कार समीक्षा के बाद ही मान्य होंगे।', 'This attempt is flagged for integrity review. Rank and rewards remain subject to review.')}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginTop: 20 }}>
          {[
            [t('स्कोर', 'Score'), `${result.score ?? 0}/${result.maxMarks ?? 0}`],
            [t('कुल रैंक', 'Overall rank'), result.rankOverall ? `#${result.rankOverall}` : '—'],
            [t('प्रतिशतक', 'Percentile'), result.percentile != null ? `${result.percentile}%` : '—'],
            [t('समय', 'Time'), result.timeTakenSecs != null ? `${Math.ceil(result.timeTakenSecs / 60)} min` : '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.58)' }}>{label}</div>
              <strong style={{ display: 'block', fontSize: 22, marginTop: 4 }}>{value}</strong>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,.75)' }}>
          <span>✅ {result.correctCount ?? 0} {t('सही', 'correct')}</span>
          <span>❌ {result.wrongCount ?? 0} {t('गलत', 'wrong')}</span>
          <span>➖ {result.skippedCount ?? 0} {t('छोड़े', 'skipped')}</span>
          {result.rankSchool ? <span>🏫 {t('स्कूल रैंक', 'School rank')} #{result.rankSchool}</span> : null}
        </div>
      </section>

      {result.certificateCode && (
        <section className="card" style={{ padding: 18, borderLeft: '4px solid var(--saffron)' }}>
          <strong style={{ color: 'var(--navy)' }}>🏅 {t('भागीदारी उपलब्धि', 'Participation achievement')}</strong>
          <p style={{ color: 'var(--slate)', fontSize: 13, marginTop: 5 }}>{t('यह सत्यापन कोड आपकी प्रतियोगिता उपलब्धि से जुड़ा है।', 'This verification code is linked to your competition achievement.')}</p>
          <code style={{ display: 'inline-block', marginTop: 8, padding: '7px 10px', background: '#F5F7FA', borderRadius: 8 }}>{result.certificateCode}</code>
        </section>
      )}

      <section className="card" style={{ padding: 22 }}>
        <h2 className="font-display font-extrabold text-lg" style={{ color: 'var(--navy)' }}>🧠 {t('प्रतियोगिता से क्या सीखें', 'What to learn from this competition')}</h2>
        <p style={{ color: 'var(--slate)', fontSize: 13, marginTop: 5 }}>{t('रैंक प्रेरणा है; अगला सीखने वाला कदम ज्यादा महत्वपूर्ण है।', 'Rank is motivation; the next learning step matters more.')}</p>
        {concepts.length === 0 ? (
          <div style={{ color: 'var(--slate)', marginTop: 14 }}>{t('इस पुराने प्रयास के लिए कॉन्सेप्ट मैपिंग उपलब्ध नहीं है।', 'Concept-level mapping is not available for this older attempt.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {concepts.map((concept) => (
              <div key={concept.concept_id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: 'var(--navy)' }}>{lang === 'hi' && concept.name_hi ? concept.name_hi : concept.name}</strong>
                  <div style={{ color: 'var(--slate)', fontSize: 12, marginTop: 4 }}>{concept.correct_count}/{concept.question_count} {t('सही', 'correct')} · {Math.round(Number(concept.accuracy_pct))}%</div>
                  {concept.needs_review && <div style={{ color: '#A45300', fontSize: 12, marginTop: 4 }}>⚠️ {t('अगले सीखने वाले प्लान में इसे दोहराना उपयोगी होगा।', 'Useful to review this in your next learning plan.')}</div>}
                </div>
                {concept.needs_review && concept.recommended_resource_slug ? (
                  <Link href={`/learn/resource/${concept.recommended_resource_slug}`} className="btn-primary" target="_blank">{t('कॉन्सेप्ट दोहराएँ', 'Review concept')} →</Link>
                ) : <span className="badge badge-green">{t('मजबूत संकेत', 'Strong signal')}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {review.length > 0 && (
        <section className="card" style={{ padding: 22 }}>
          <h2 className="font-display font-extrabold text-lg" style={{ color: 'var(--navy)' }}>📝 {t('प्रश्न समीक्षा', 'Question review')}</h2>
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {review.map((item, index) => (
              <div key={item.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                <strong style={{ color: 'var(--navy)' }}>{index + 1}. {lang === 'hi' && item.question_hi ? item.question_hi : item.question_text}</strong>
                <div style={{ fontSize: 13, marginTop: 7, color: item.is_correct ? 'var(--forest)' : '#A61B1B' }}>
                  {t('आपका उत्तर', 'Your answer')}: {item.selected_option || '—'} · {t('सही उत्तर', 'Correct answer')}: {item.correct_option}
                </div>
                {(lang === 'hi' && item.explanation_hi ? item.explanation_hi : item.explanation) && (
                  <p style={{ color: 'var(--slate)', fontSize: 13, marginTop: 6 }}>{lang === 'hi' && item.explanation_hi ? item.explanation_hi : item.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingBottom: 28 }}>
        <Link href="/student?section=learning" className="btn-primary">{t('निजी लर्निंग यात्रा जारी रखें', 'Continue personalized learning')}</Link>
        <Link href="/exams" className="btn-outline">{t('और प्रतियोगिताएँ', 'More competitions')}</Link>
      </div>
    </div>
  );
}
