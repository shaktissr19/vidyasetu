'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/store/authStore';
import { logout as apiLogout } from '@/services/authService';

const ROLE_DESTINATIONS = {
  STUDENT:      '/student',
  SCHOOL_ADMIN: '/school/overview',
  TEACHER:      '/school/overview',
  PARENT:       '/parent/dashboard',
  SUPER_ADMIN:  '/admin/analytics',
};

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoggedIn, refreshToken, logout } = useAuthStore();
  const [lang, setLang] = useState('en');
  const [mounted, setMounted] = useState(false);
  const [cd, setCd] = useState({ d: '03', h: '14', m: '22', s: '45' });

  // Prevent hydration mismatch while the persisted auth store rehydrates.
  useEffect(() => { setMounted(true); }, []);

  // Countdown timer
  useEffect(() => {
    const target = new Date(Date.now() + 3 * 86400000 + 14 * 3600000);
    const timer = setInterval(() => {
      const diff = target - new Date();
      if (diff <= 0) return clearInterval(timer);
      setCd({
        d: String(Math.floor(diff / 86400000)).padStart(2, '0'),
        h: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
        m: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
        s: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const t = (en, hi) => (mounted && lang === 'hi') ? hi : en;
  const sessionActive = mounted && isLoggedIn;
  const dashboardPath = ROLE_DESTINATIONS[user?.role] || '/';
  const go = () => router.push(sessionActive ? dashboardPath : '/login');

  async function handleLogout() {
    try { if (refreshToken) await apiLogout(refreshToken); } catch (_) {}
    logout();
    router.replace('/');
  }

  const features = [
    ['📚', 'AI-Powered Learning', 'AI लर्निंग', 'NCERT lessons with AI tutor in Hindi & 8 languages.', 'हिंदी में NCERT और AI ट्यूटर।'],
    ['🏫', 'Complete School Management', 'स्कूल प्रबंधन', 'Attendance, fees, results — all in one place, free.', 'उपस्थिति, शुल्क, परिणाम — एक जगह।'],
    ['👨‍👩‍👧', 'Parent Connect', 'पेरेंट कनेक्ट', 'Real-time alerts via WhatsApp. No app download needed.', 'WhatsApp पर रियल-टाइम अलर्ट।'],
    ['📈', 'Progress & Performance', 'प्रगति और प्रदर्शन', 'Track lessons, quiz scores and academic progress clearly.', 'पाठ, क्विज़ स्कोर और शैक्षणिक प्रगति स्पष्ट रूप से देखें।'],
    ['🏆', 'Monthly Olympiads', 'मासिक ओलंपियाड', 'Compete across Bharat. Win up to ₹5 lakh monthly.', '₹5 लाख तक जीतें।'],
    ['🌐', '9 Regional Languages', '9 भाषाएँ', 'Hindi, Tamil, Telugu, Marathi, Bengali and more.', 'हिंदी, तमिल, तेलुगु और अधिक।'],
    ['📶', 'Offline-First', 'ऑफलाइन', 'Study without internet. Auto-syncs when back online.', 'इंटरनेट के बिना पढ़ें।'],
    ['🤖', 'AI Doubt Solver', 'AI डाउट सॉल्वर', 'Ask doubts in Hindi. Get instant step-by-step answers.', 'हिंदी में सवाल, तुरंत जवाब।'],
  ];

  const testimonials = [
    ['"My daughter was struggling in Maths. VidyaSetu\'s AI tutor helped her score 87 in the Olympiad. Hindi explanations made everything clear."', '"मेरी बेटी गणित में कमज़ोर थी। VidyaSetu AI से उसने 87 अंक लिए।"', 'Savita Devi, Parent', 'Muzaffarpur, Bihar'],
    ['"The school system handles attendance and fees. WhatsApp notifications reduced absenteeism by 30%. Free and easy to use!"', '"स्कूल सिस्टम ने उपस्थिति और फीस आसान की। अनुपस्थिति 30% कम हुई।"', 'Rajendra Gupta, Principal', 'Saraswati Vidyalay, Morena MP'],
    ['"I can see my quiz scores, lesson progress and exam results in one place. It helps me understand what I should practise next."', '"मैं अपने क्विज़ स्कोर, पाठ की प्रगति और परीक्षा परिणाम एक जगह देख सकता हूँ। इससे मुझे पता चलता है कि आगे क्या अभ्यास करना है।"', 'Arjun Patel, Class 8', 'Shivaji School, Anand Gujarat'],
  ];

  return (
    <div style={{ fontFamily: "'Noto Sans', sans-serif", background: '#FAFAF8', color: '#0D1B3E', overflowX: 'hidden' }}>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(10px)',
        borderBottom: '2px solid #FF6B00',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 64,
        boxShadow: '0 2px 12px rgba(255,107,0,0.10)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => window.scrollTo(0, 0)}>
          <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'white', fontSize: 20 }}>V</div>
          <span style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E' }}>
            Vidya<span style={{ color: '#FF6B00' }}>Setu</span>
          </span>
        </div>

        {/* Nav Links */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {['Home', 'Olympiad', 'Student', 'School', 'Parent', 'Admin'].map((label) => (
            <a key={label} href={`#${label.toLowerCase().replace(' ', '-')}`}
              style={{ fontSize: '0.875rem', fontWeight: 600, color: '#5A6278', padding: '8px 14px', borderRadius: 8, textDecoration: 'none', transition: 'all 0.2s', display: 'inline-block' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FFF3E8'; e.currentTarget.style.color = '#FF6B00'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5A6278'; }}>
              {label === 'Home' ? t('Home', 'होम') :
               label === 'Olympiad' ? t('Olympiad', 'ओलंपियाड') :
               label === 'Student' ? t('Student', 'छात्र') :
               label === 'School' ? t('School', 'स्कूल') :
               label === 'Parent' ? t('Parent', 'अभिभावक') : t('Admin', 'एडमिन')}
            </a>
          ))}
          <button onClick={() => setLang(l => l === 'en' ? 'hi' : 'en')}
            style={{ background: '#0D1B3E', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}>
            {mounted && lang === 'en' ? 'हिंदी' : 'EN'}
          </button>
        </div>

        {/* Session-aware actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#138808' }}>{t('Offline Ready', 'ऑफलाइन रेडी')}</span>
          </div>
          {sessionActive ? (
            <>
              <button onClick={() => router.push(dashboardPath)} title="Back to dashboard"
                style={{ background: '#F5F7FA', border: 'none', color: '#0D1B3E', fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '0.9rem', padding: '8px 16px', borderRadius: 9, cursor: 'pointer' }}>
                {user?.name?.split(' ')[0] || t('Account', 'खाता')}
              </button>
              <button onClick={handleLogout}
                style={{ background: 'none', border: '2px solid #FF6B00', color: '#FF6B00', fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '0.9rem', padding: '7px 20px', borderRadius: 9, cursor: 'pointer' }}>
                {t('Logout', 'लॉगआउट')}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => router.push('/login')}
                style={{ background: 'none', border: '2px solid #FF6B00', color: '#FF6B00', fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '0.9rem', padding: '7px 20px', borderRadius: 9, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FF6B00'; e.currentTarget.style.color = 'white'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#FF6B00'; }}>
                {t('Login', 'लॉगिन')}
              </button>
              <button onClick={() => router.push('/register')}
                style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', border: 'none', color: 'white', fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '0.9rem', padding: '8px 22px', borderRadius: 9, cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,107,0,0.35)' }}>
                {t('Join Free →', 'मुफ्त जुड़ें →')}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ── */}
      <section id="home" style={{ background: 'linear-gradient(135deg,#0D1B3E 0%,#1A2F5E 60%,#1A3A6E 100%)', padding: '130px 48px 90px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, right: -100, width: 500, height: 500, background: 'radial-gradient(circle,rgba(255,107,0,0.15) 0%,transparent 70%)', borderRadius: '50%' }} />
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 64, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,107,0,0.15)', border: '1px solid rgba(255,107,0,0.35)', color: '#FF9A3C', fontSize: '0.78rem', fontWeight: 700, padding: '5px 16px', borderRadius: 20, marginBottom: 24, letterSpacing: '0.5px' }}>
              🇮🇳 {t("India's Rural Education OS", "भारत का ग्रामीण शिक्षा OS")}
            </div>
            <h1 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '3.2rem', fontWeight: 900, color: 'white', lineHeight: 1.1, marginBottom: 12 }}>
              {t('Learning for', 'हर')}{' '}
              <span style={{ color: '#FF9A3C' }}>{t('Every Student', 'छात्र के लिए')}</span>
              <br />{t('in Bharat', 'भारत में')}
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.55)', marginBottom: 12, fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
              भारत के हर गाँव तक शिक्षा पहुँचाना
            </p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '1.05rem', lineHeight: 1.75, marginBottom: 36, maxWidth: 500 }}>
              {t('School Management + Learning Platform + Student OS. Works offline, in Hindi and 8 regional languages.', 'स्कूल प्रबंधन + लर्निंग प्लेटफॉर्म। हिंदी और 8 भाषाओं में, ऑफलाइन।')}
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button onClick={go} style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: 'white', border: 'none', padding: '15px 32px', fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '1rem', borderRadius: 12, cursor: 'pointer', boxShadow: '0 8px 28px rgba(255,107,0,0.45)' }}>
                🎓 {t(sessionActive ? 'Go to Dashboard' : 'Start Learning Free', sessionActive ? 'डैशबोर्ड पर जाएँ' : 'मुफ्त शुरू करें')}
              </button>
              <button onClick={go} style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '2px solid rgba(255,255,255,0.25)', padding: '14px 30px', fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '1rem', borderRadius: 12, cursor: 'pointer' }}>
                🏫 {t(sessionActive ? 'Open My Account' : 'Register Your School', sessionActive ? 'मेरा खाता खोलें' : 'स्कूल रजिस्टर करें')}
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ flex: '0 0 290px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['🎓', '1.2L+', t('Students Learning', 'छात्र सीख रहे हैं')],
              ['🏫', '3,412', t('Schools Onboarded', 'स्कूल जुड़े')],
              ['📶', t('Offline', 'ऑफलाइन'), t('Works Without Internet', 'इंटरनेट के बिना')],
              ['🌐', '9', t('Regional Languages', 'क्षेत्रीय भाषाएँ')],
            ].map(([icon, num, label], i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px 20px', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: '1.8rem' }}>{icon}</span>
                <div>
                  <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>{num}</div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', marginTop: 2 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="student" style={{ padding: '72px 48px', background: 'white' }}>
        <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2.2rem', fontWeight: 800, color: '#0D1B3E', textAlign: 'center', marginBottom: 6 }}>
          {t('Everything Your School Needs', 'स्कूल को चाहिए सब कुछ')}
        </h2>
        <div style={{ width: 64, height: 4, background: 'linear-gradient(to right,#FF6B00,#FF9A3C)', borderRadius: 4, margin: '8px auto 40px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 24, maxWidth: 1100, margin: '0 auto' }}>
          {features.map(([icon, titleEn, titleHi, descEn, descHi], i) => (
            <div key={i}
              style={{ background: 'white', border: '1.5px solid #E5E7F0', borderRadius: 16, padding: '28px 24px', transition: 'all 0.25s', cursor: 'default' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#FF6B00'; e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(13,27,62,0.10)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7F0'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ fontSize: '2.4rem', marginBottom: 16 }}>{icon}</div>
              <div style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '1rem', color: '#0D1B3E', marginBottom: 8 }}>{t(titleEn, titleHi)}</div>
              <div style={{ color: '#5A6278', fontSize: '0.85rem', lineHeight: 1.65 }}>{t(descEn, descHi)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: '#0D1B3E', padding: '72px 48px' }}>
        <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2.2rem', fontWeight: 800, color: 'white', textAlign: 'center', marginBottom: 6 }}>
          {t('How VidyaSetu Works', 'VidyaSetu कैसे काम करता है')}
        </h2>
        <div style={{ width: 64, height: 4, background: 'linear-gradient(to right,#FF6B00,#FF9A3C)', borderRadius: 4, margin: '8px auto 48px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 0, maxWidth: 1000, margin: '0 auto' }}>
          {[
            ['1', t('School Registers', 'स्कूल रजिस्टर'), t('Free onboarding in 5 minutes. Upload student list.', '5 मिनट में मुफ्त सेटअप।')],
            ['2', t('Students Login', 'छात्र लॉगिन'), t('Use username, email or Student ID with password. OTP is also available.', 'यूज़रनेम, ईमेल या Student ID और पासवर्ड से लॉगिन करें। OTP भी उपलब्ध है।')],
            ['3', t('Learn & Practice', 'पढ़ें और अभ्यास'), t('NCERT videos + AI tutor in Hindi. Download offline.', 'हिंदी में NCERT + AI ट्यूटर।')],
            ['4', t('Parents Stay Updated', 'माता-पिता अपडेट'), t('WhatsApp alerts for attendance, fees, results.', 'WhatsApp पर उपस्थिति और परिणाम।')],
          ].map(([n, title, desc], i) => (
            <div key={i} style={{ textAlign: 'center', padding: '32px 24px', position: 'relative' }}>
              {i < 3 && <span style={{ position: 'absolute', right: -12, top: '40%', color: 'rgba(255,107,0,0.5)', fontSize: '1.8rem' }}>→</span>}
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Baloo 2', cursive", fontWeight: 900, fontSize: '1.4rem', color: 'white', margin: '0 auto 16px' }}>{n}</div>
              <div style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 700, color: 'white', fontSize: '1rem', marginBottom: 8 }}>{title}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', lineHeight: 1.65 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── OLYMPIAD BANNER ── */}
      <section id="olympiad" style={{ padding: '48px', background: '#F0F4F8' }}>
        <div style={{ background: 'linear-gradient(135deg,#1a0533,#2d0a52)', padding: '40px 32px', textAlign: 'center', borderRadius: 20, maxWidth: 1000, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -60, right: -60, width: 280, height: 280, background: 'radial-gradient(circle,rgba(255,107,0,0.18),transparent 70%)', borderRadius: '50%' }} />
          <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2rem', fontWeight: 800, color: 'white', marginBottom: 8 }}>
            🏆 {t('April Maths Olympiad 2026', 'अप्रैल गणित ओलंपियाड 2026')}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24, fontSize: '0.95rem' }}>
            {t('8,420 students registered · ₹5,00,000 prize pool · Classes 6–10', '8,420 छात्र पंजीकृत · ₹5,00,000 पुरस्कार · कक्षा 6–10')}
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 28 }}>
            {[[cd.d, t('DAYS', 'दिन')], [cd.h, t('HOURS', 'घंटे')], [cd.m, t('MINS', 'मिनट')], [cd.s, t('SECS', 'सेकंड')]].map(([n, l], i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <span style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2.2rem', fontWeight: 900, color: '#FF9A3C', background: 'rgba(255,255,255,0.08)', padding: '10px 18px', borderRadius: 12, display: 'block', minWidth: 72 }}>{n}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '1px' }}>{l}</span>
              </div>
            ))}
          </div>
          <button onClick={go} style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', border: 'none', color: 'white', padding: '13px 36px', fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '1rem', borderRadius: 12, cursor: 'pointer', boxShadow: '0 6px 24px rgba(255,107,0,0.5)' }}>
            {t(sessionActive ? 'Go to Dashboard →' : 'Register Free →', sessionActive ? 'डैशबोर्ड पर जाएँ →' : 'मुफ्त रजिस्टर करें →')}
          </button>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: '72px 48px', background: 'white' }}>
        <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2.2rem', fontWeight: 800, color: '#0D1B3E', textAlign: 'center', marginBottom: 6 }}>
          {t('What Students & Schools Say', 'छात्र और स्कूल क्या कहते हैं')}
        </h2>
        <div style={{ width: 64, height: 4, background: 'linear-gradient(to right,#FF6B00,#FF9A3C)', borderRadius: 4, margin: '8px auto 40px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 24, maxWidth: 1100, margin: '0 auto' }}>
          {testimonials.map(([textEn, textHi, name, loc], i) => (
            <div key={i} style={{ background: 'white', border: '1.5px solid #E5E7F0', borderRadius: 16, padding: '28px 24px', transition: 'box-shadow 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 28px rgba(13,27,62,0.09)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <div style={{ color: '#F5C518', marginBottom: 14, fontSize: '1.1rem', letterSpacing: 3 }}>★★★★★</div>
              <p style={{ color: '#5A6278', fontSize: '0.9rem', lineHeight: 1.75, marginBottom: 20, fontStyle: 'italic' }}>{t(textEn, textHi)}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#FFF3E8,#FFE0C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>😊</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0D1B3E' }}>{name}</div>
                  <div style={{ fontSize: '0.76rem', color: '#5A6278', marginTop: 2 }}>{loc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#0D1B3E', padding: '44px 48px', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.4rem', fontWeight: 800, color: 'white', marginBottom: 20 }}>
          Vidya<span style={{ color: '#FF6B00' }}>Setu</span>
        </div>
        <div style={{ display: 'flex', gap: 28, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          {['About', 'Privacy', 'Terms', 'Contact', 'CSR / Govt'].map(l => (
            <a key={l} href="#" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: '0.85rem', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#FF9A3C'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.45)'}>{l}</a>
          ))}
        </div>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem' }}>
          © 2026 VidyaSetu · Built with ❤️ for Bharat · <span style={{ color: '#FF9A3C' }}>vidyasetu.sbs</span>
        </p>
      </footer>
    </div>
  );
}