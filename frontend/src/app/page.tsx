'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@vidyasetu/contracts';
import useAuthStore from '@/store/authStore';
import { logout as apiLogout } from '@/services/authService';
import {
  getPublicCompetitions,
  getPublicOverview,
  type PublicCompetition,
  type PublicOverview,
} from '@/services/publicService';
import styles from './landing.module.css';

const ROLE_DESTINATIONS: Record<UserRole, string> = {
  STUDENT: '/student',
  SCHOOL_ADMIN: '/school/overview',
  TEACHER: '/school/overview',
  PARENT: '/parent/dashboard',
  SUPER_ADMIN: '/admin/analytics',
};

const ROLE_ENTRIES = [
  {
    id: 'student',
    icon: '🎓',
    title: 'Student',
    titleHi: 'छात्र',
    copy: 'Learning, AI Tutor, Doubts, Competitions, Groups, attendance and report cards.',
    copyHi: 'लर्निंग, AI ट्यूटर, डाउट्स, प्रतियोगिताएँ, समूह, उपस्थिति और रिपोर्ट कार्ड।',
    href: '/student',
  },
  {
    id: 'school',
    icon: '🏫',
    title: 'School & Teacher',
    titleHi: 'स्कूल और शिक्षक',
    copy: 'Students, teachers, classes, attendance, fees, timetable, exams, results and Groups.',
    copyHi: 'छात्र, शिक्षक, कक्षाएँ, उपस्थिति, फीस, समय-सारणी, परीक्षा, परिणाम और समूह।',
    href: '/school/overview',
  },
  {
    id: 'parent',
    icon: '👨‍👩‍👧',
    title: 'Parent',
    titleHi: 'अभिभावक',
    copy: 'Performance, attendance, fees, report cards, teacher messages and Parent Groups.',
    copyHi: 'प्रदर्शन, उपस्थिति, फीस, रिपोर्ट कार्ड, शिक्षक संदेश और अभिभावक समूह।',
    href: '/parent/dashboard',
  },
  {
    id: 'admin',
    icon: '🛡️',
    title: 'Platform Admin',
    titleHi: 'प्लेटफ़ॉर्म एडमिन',
    copy: 'Platform analytics, schools, users, Competitions, content, Groups, support and settings.',
    copyHi: 'प्लेटफ़ॉर्म एनालिटिक्स, स्कूल, उपयोगकर्ता, प्रतियोगिताएँ, कंटेंट, समूह, सपोर्ट और सेटिंग्स।',
    href: '/admin/analytics',
  },
] as const;

const FEATURES = [
  {
    id: 'learning', icon: '📚', title: 'AI-Powered Learning', titleHi: 'AI-सक्षम लर्निंग',
    summary: 'Structured learning with subject progress and AI assistance.',
    summaryHi: 'विषय प्रगति और AI सहायता के साथ संरचित लर्निंग।',
    details: ['Subject and chapter progress', 'AI Tutor support', 'Student learning dashboard'],
    action: '/student',
  },
  {
    id: 'school', icon: '🏫', title: 'Complete School Management', titleHi: 'संपूर्ण स्कूल प्रबंधन',
    summary: 'Operate students, teachers, attendance, fees, timetable, exams and results from one workspace.',
    summaryHi: 'एक ही वर्कस्पेस से छात्र, शिक्षक, उपस्थिति, फीस, समय-सारणी, परीक्षा और परिणाम।',
    details: ['Class and teacher management', 'Attendance and fee operations', 'Timetable, exams and report cards'],
    action: '/school/overview',
  },
  {
    id: 'parent', icon: '👨‍👩‍👧', title: 'Parent Connect', titleHi: 'पेरेंट कनेक्ट',
    summary: 'Parents can follow their child’s actual school and learning records.',
    summaryHi: 'अभिभावक अपने बच्चे के वास्तविक स्कूल और लर्निंग रिकॉर्ड देख सकते हैं।',
    details: ['Performance and attendance', 'Fees and report cards', 'Teacher messaging and Parent Groups'],
    action: '/parent/dashboard',
  },
  {
    id: 'performance', icon: '📈', title: 'Progress & Performance', titleHi: 'प्रगति और प्रदर्शन',
    summary: 'Bring academic activity, results and learning progress into one clear view.',
    summaryHi: 'शैक्षणिक गतिविधि, परिणाम और लर्निंग प्रगति एक स्पष्ट दृश्य में।',
    details: ['Learning progress', 'Assessment and result history', 'Role-specific dashboards'],
    action: '/student',
  },
  {
    id: 'competitions', icon: '🏆', title: 'Competitions & Challenges', titleHi: 'प्रतियोगिताएँ और चुनौतियाँ',
    summary: 'Academic competitions, mock challenges and practice events from the real competition engine.',
    summaryHi: 'वास्तविक प्रतियोगिता इंजन से शैक्षणिक प्रतियोगिताएँ, मॉक चुनौतियाँ और अभ्यास इवेंट।',
    details: ['Registration and attempts', 'Scoring and leaderboards', 'Results through the Competition engine'],
    action: '/competition',
  },
  {
    id: 'groups', icon: '👥', title: 'Private Groups', titleHi: 'निजी समूह',
    summary: 'Controlled Student, Parent and Teacher collaboration — not an open social network.',
    summaryHi: 'नियंत्रित छात्र, अभिभावक और शिक्षक सहयोग — खुला सोशल नेटवर्क नहीं।',
    details: ['Admin approval for new Groups', 'Owner-controlled join requests and invitations', 'Posts, comments, resources and moderation'],
    action: '#groups',
  },
  {
    id: 'offline', icon: '📶', title: 'Offline Learning Support', titleHi: 'ऑफलाइन लर्निंग सपोर्ट',
    summary: 'Offline-capable learning workflows are part of the Student experience; this is a capability, not a connection-status badge.',
    summaryHi: 'ऑफलाइन-सक्षम लर्निंग छात्र अनुभव का हिस्सा है; यह कनेक्शन-स्टेटस बैज नहीं है।',
    details: ['Offline learning workspace', 'Sync-oriented Student workflow', 'Designed for variable connectivity'],
    action: '/student',
  },
  {
    id: 'doubts', icon: '🤖', title: 'AI Doubt Solver', titleHi: 'AI डाउट सॉल्वर',
    summary: 'Students can use AI Tutor and the Doubt Forum inside their authenticated workspace.',
    summaryHi: 'छात्र अपने प्रमाणित वर्कस्पेस में AI ट्यूटर और डाउट फोरम का उपयोग कर सकते हैं।',
    details: ['AI Tutor', 'Doubt Forum', 'Teacher and student learning support'],
    action: '/student',
  },
] as const;

function formatCount(value: number | undefined): string {
  return value === undefined ? '—' : value.toLocaleString('en-IN');
}

function competitionType(type: PublicCompetition['type']): string {
  if (type === 'MOCK') return 'Mock Challenge';
  if (type === 'PRACTICE') return 'Practice Challenge';
  return 'Academic Competition';
}

function competitionDate(value?: string | null): string {
  if (!value) return 'Schedule to be announced';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Schedule to be announced';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoggedIn, refreshToken, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [competitions, setCompetitions] = useState<PublicCompetition[]>([]);
  const [competitionsFailed, setCompetitionsFailed] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string>('school');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getPublicOverview(), getPublicCompetitions()]).then(([overviewResult, competitionResult]) => {
      if (cancelled) return;
      if (overviewResult.status === 'fulfilled') {
        setOverview(overviewResult.value.data.data);
      } else {
        setOverviewFailed(true);
      }
      if (competitionResult.status === 'fulfilled') {
        setCompetitions(competitionResult.value.data.data || []);
      } else {
        setCompetitionsFailed(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const t = (en: string, hi: string): string => (mounted && lang === 'hi' ? hi : en);
  const sessionActive = mounted && isLoggedIn;
  const dashboardPath = user?.role ? ROLE_DESTINATIONS[user.role] : '/';

  const selectedFeature = useMemo(
    () => FEATURES.find((feature) => feature.id === activeFeature) || FEATURES[0],
    [activeFeature],
  );

  const heroMetrics = [
    ['🎓', formatCount(overview?.students), t('Active Students', 'सक्रिय छात्र')],
    ['🏫', formatCount(overview?.schools), t('Active Schools', 'सक्रिय स्कूल')],
    ['👩‍🏫', formatCount(overview?.teachers), t('Teachers', 'शिक्षक')],
    ['👥', formatCount(overview?.groups), t('Active Groups', 'सक्रिय समूह')],
  ];

  const allMetrics = [
    [formatCount(overview?.students), t('Students', 'छात्र')],
    [formatCount(overview?.schools), t('Schools', 'स्कूल')],
    [formatCount(overview?.teachers), t('Teachers', 'शिक्षक')],
    [formatCount(overview?.parents), t('Parents', 'अभिभावक')],
    [formatCount(overview?.groups), t('Groups', 'समूह')],
    [formatCount(overview?.competitions), t('Competitions', 'प्रतियोगिताएँ')],
  ];

  async function handleLogout(): Promise<void> {
    try { if (refreshToken) await apiLogout(refreshToken); } catch (_) {}
    logout();
    router.replace('/');
  }

  function scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openRole(href: string): void {
    router.push(href);
  }

  function openFeature(action: string): void {
    if (action.startsWith('#')) {
      scrollTo(action.slice(1));
      return;
    }
    router.push(action);
  }

  function openGroups(): void {
    if (!sessionActive || !user?.role) {
      router.push('/login');
      return;
    }
    if (user.role === 'PARENT') router.push('/parent/groups');
    else if (user.role === 'SCHOOL_ADMIN' || user.role === 'TEACHER') router.push('/school/groups');
    else if (user.role === 'SUPER_ADMIN') router.push('/groups');
    else router.push('/student');
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="VidyaSetu public navigation">
        <button className={styles.logo} onClick={() => scrollTo('home')} aria-label="VidyaSetu home">
          <span className={styles.logoMark}>V</span>
          <span className={styles.logoText}>Vidya<span className={styles.logoAccent}>Setu</span></span>
        </button>

        <div className={styles.navLinks}>
          <button className={styles.navLink} onClick={() => scrollTo('home')}>{t('Home', 'होम')}</button>
          <button className={styles.navLink} onClick={() => router.push('/competition')}>{t('Competitions', 'प्रतियोगिताएँ')}</button>
          <button className={styles.navLink} onClick={() => scrollTo('groups')}>{t('Groups', 'समूह')}</button>
          <button className={styles.navLink} onClick={() => openRole('/student')}>{t('Student', 'छात्र')}</button>
          <button className={styles.navLink} onClick={() => openRole('/school/overview')}>{t('School', 'स्कूल')}</button>
          <button className={styles.navLink} onClick={() => openRole('/parent/dashboard')}>{t('Parent', 'अभिभावक')}</button>
          <button className={styles.navLink} onClick={() => openRole('/admin/analytics')}>{t('Admin', 'एडमिन')}</button>
        </div>

        <div className={styles.navActions}>
          <button className={styles.language} onClick={() => setLang((current) => current === 'en' ? 'hi' : 'en')}>
            {lang === 'en' ? 'हिंदी' : 'EN'}
          </button>
          {sessionActive ? (
            <>
              <button className={styles.account} onClick={() => router.push(dashboardPath)}>{user?.name?.split(' ')[0] || t('Dashboard', 'डैशबोर्ड')}</button>
              <button className={styles.login} onClick={handleLogout}>{t('Logout', 'लॉगआउट')}</button>
            </>
          ) : (
            <>
              <button className={styles.login} onClick={() => router.push('/login')}>{t('Login', 'लॉगिन')}</button>
              <button className={styles.primarySmall} onClick={() => router.push('/register')}>{t('Create Account', 'खाता बनाएँ')}</button>
            </>
          )}
        </div>
      </nav>

      <section id="home" className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <div className={styles.eyebrow}>🇮🇳 {t("India's Education & School Platform", 'भारत का शिक्षा और स्कूल प्लेटफ़ॉर्म')}</div>
            <h1>
              {t('Learning, School Operations and', 'लर्निंग, स्कूल संचालन और')}<br />
              <span className={styles.heroAccent}>{t('Connected Support', 'जुड़ा हुआ सहयोग')}</span>
            </h1>
            <p className={styles.heroHindi}>भारत के हर गाँव तक शिक्षा पहुँचाना</p>
            <p className={styles.heroCopy}>
              {t(
                'VidyaSetu connects Student learning, School Management, Parent visibility, Competitions and private moderated Groups in one platform.',
                'VidyaSetu छात्र लर्निंग, स्कूल प्रबंधन, अभिभावक दृश्यता, प्रतियोगिताओं और निजी नियंत्रित समूहों को एक प्लेटफ़ॉर्म में जोड़ता है।',
              )}
            </p>
            <div className={styles.heroActions}>
              <button className={styles.primary} onClick={() => router.push(sessionActive ? dashboardPath : '/register')}>
                {sessionActive ? t('Open My Dashboard', 'मेरा डैशबोर्ड खोलें') : t('Start with VidyaSetu', 'VidyaSetu शुरू करें')}
              </button>
              <button className={styles.secondary} onClick={() => openRole('/school/overview')}>{t('Open School Workspace', 'स्कूल वर्कस्पेस खोलें')}</button>
            </div>
          </div>

          <div className={styles.metricsPanel} aria-label="Live platform metrics">
            {heroMetrics.map(([icon, value, label]) => (
              <div className={styles.metricCard} key={label}>
                <div className={styles.metricIcon}>{icon}</div>
                <div className={styles.metricValue}>{value}</div>
                <div className={styles.metricLabel}>{label}</div>
              </div>
            ))}
            <div className={styles.metricFoot}>
              <span className={styles.liveDot} />
              {overviewFailed
                ? t('Live platform metrics are temporarily unavailable — no placeholder numbers are shown.', 'लाइव प्लेटफ़ॉर्म आँकड़े अभी उपलब्ध नहीं हैं — कोई नकली संख्या नहीं दिखाई गई है।')
                : overview
                  ? t('Live counts from the VidyaSetu database', 'VidyaSetu डेटाबेस से लाइव संख्या')
                  : t('Loading live platform counts…', 'लाइव प्लेटफ़ॉर्म संख्या लोड हो रही है…')}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="capabilities">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <h2>{t('Everything Your School Community Needs', 'आपके स्कूल समुदाय को जो चाहिए')}</h2>
            <div className={styles.orangeRule} />
            <p>{t('These cards now explain what each capability actually does. Hover or click a card to explore the details and open the relevant workspace.', 'अब हर कार्ड स्पष्ट करता है कि यह सुविधा वास्तव में क्या करती है। विवरण देखने के लिए कार्ड पर होवर या क्लिक करें।')}</p>
          </div>

          <div className={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <button
                type="button"
                key={feature.id}
                className={`${styles.featureCard} ${activeFeature === feature.id ? styles.featureCardActive : ''}`}
                onMouseEnter={() => setActiveFeature(feature.id)}
                onFocus={() => setActiveFeature(feature.id)}
                onClick={() => setActiveFeature(feature.id)}
              >
                <div className={styles.featureIcon}>{feature.icon}</div>
                <div className={styles.featureTitle}>{t(feature.title, feature.titleHi)}</div>
                <div className={styles.featureSummary}>{t(feature.summary, feature.summaryHi)}</div>
                <div className={styles.featureMore}>{activeFeature === feature.id ? t('Details shown below', 'विवरण नीचे है') : t('View details', 'विवरण देखें')}</div>
              </button>
            ))}
          </div>

          <div className={styles.featureDetail}>
            <div>
              <h3>{selectedFeature.icon} {t(selectedFeature.title, selectedFeature.titleHi)}</h3>
              <p>{t(selectedFeature.summary, selectedFeature.summaryHi)}</p>
              <button className={styles.primary} onClick={() => openFeature(selectedFeature.action)}>{t('Open this area', 'यह क्षेत्र खोलें')}</button>
            </div>
            <ul className={styles.detailList}>
              {selectedFeature.details.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`} id="roles">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <h2>{t('Choose Your Workspace', 'अपना वर्कस्पेस चुनें')}</h2>
            <div className={styles.orangeRule} />
            <p>{t('Student, School, Parent and Admin are real application entry points now — not dead landing-page anchors.', 'Student, School, Parent और Admin अब वास्तविक एप्लिकेशन एंट्री पॉइंट हैं — निष्क्रिय लैंडिंग लिंक नहीं।')}</p>
          </div>
          <div className={styles.roleGrid}>
            {ROLE_ENTRIES.map((entry) => (
              <article className={styles.roleCard} key={entry.id}>
                <div className={styles.roleIcon}>{entry.icon}</div>
                <h3>{t(entry.title, entry.titleHi)}</h3>
                <p>{t(entry.copy, entry.copyHi)}</p>
                <button className={styles.darkButton} onClick={() => openRole(entry.href)}>{t(`Open ${entry.title}`, `${entry.titleHi} खोलें`)}</button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="groups" className={`${styles.section} ${styles.sectionDark}`}>
        <div className={`${styles.sectionInner} ${styles.groupsWrap}`}>
          <div className={styles.groupsCopy}>
            <div className={styles.eyebrow}>👥 {t('Groups — controlled collaboration', 'समूह — नियंत्रित सहयोग')}</div>
            <h2>{t('A safer alternative to an open “Community” feed', 'खुले “Community” फ़ीड का सुरक्षित विकल्प')}</h2>
            <p>{t('Students, Parents and Teachers can collaborate in private Groups. New Groups require platform approval, membership is controlled by the Group owner or moderator, and invitations still require the recipient to accept.', 'छात्र, अभिभावक और शिक्षक निजी समूहों में सहयोग कर सकते हैं। नए समूहों के लिए प्लेटफ़ॉर्म स्वीकृति, सदस्यता के लिए समूह मालिक/मॉडरेटर की स्वीकृति और निमंत्रण के लिए प्राप्तकर्ता की सहमति आवश्यक है।')}</p>
            <div className={styles.heroActions}>
              <button className={styles.primary} onClick={openGroups}>{t('Open Groups', 'समूह खोलें')}</button>
              {!sessionActive && <button className={styles.secondary} onClick={() => router.push('/register')}>{t('Create an Account', 'खाता बनाएँ')}</button>}
            </div>
          </div>
          <div className={styles.flow}>
            <div className={styles.flowStep}><strong>1. {t('Request a Group', 'समूह का अनुरोध करें')}</strong><span>{t('Student, Parent, Teacher or School Admin requests an eligible Group type.', 'योग्य भूमिका वाला उपयोगकर्ता समूह बनाने का अनुरोध करता है।')}</span></div>
            <div className={styles.flowStep}><strong>2. {t('Admin Approval', 'एडमिन स्वीकृति')}</strong><span>{t('The Group becomes active only after platform approval.', 'प्लेटफ़ॉर्म स्वीकृति के बाद ही समूह सक्रिय होता है।')}</span></div>
            <div className={styles.flowStep}><strong>3. {t('Controlled Membership', 'नियंत्रित सदस्यता')}</strong><span>{t('Join requests need owner/moderator approval; invitations need recipient acceptance.', 'जॉइन अनुरोध के लिए मालिक/मॉडरेटर स्वीकृति और निमंत्रण के लिए प्राप्तकर्ता की सहमति चाहिए।')}</span></div>
            <div className={styles.flowStep}><strong>4. {t('Moderated Discussion', 'नियंत्रित चर्चा')}</strong><span>{t('Members can post, comment, share resources and report inappropriate content.', 'सदस्य पोस्ट, कमेंट, संसाधन साझा और अनुचित सामग्री रिपोर्ट कर सकते हैं।')}</span></div>
          </div>
        </div>
      </section>

      <section id="competitions" className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <h2>{t('Competitions & Academic Challenges', 'प्रतियोगिताएँ और शैक्षणिक चुनौतियाँ')}</h2>
            <div className={styles.orangeRule} />
            <p>{t('This section is driven by the real Competition API. No fake countdown and no invented prize claims.', 'यह सेक्शन वास्तविक Competition API से चलता है। कोई नकली काउंटडाउन या बनाई हुई पुरस्कार राशि नहीं।')}</p>
          </div>

          <div className={styles.competitionGrid}>
            {competitionsFailed ? (
              <div className={styles.emptyState}>{t('Competition data is temporarily unavailable.', 'प्रतियोगिता डेटा अभी उपलब्ध नहीं है।')}</div>
            ) : competitions.length === 0 ? (
              <div className={styles.emptyState}>{t('There are no published Competitions at the moment. New events will appear here when an Admin publishes them.', 'अभी कोई प्रकाशित प्रतियोगिता नहीं है। एडमिन द्वारा नई प्रतियोगिता प्रकाशित होने पर वह यहाँ दिखाई देगी।')}</div>
            ) : competitions.slice(0, 3).map((competition) => (
              <article className={styles.competitionCard} key={competition.id}>
                <span className={styles.statusPill}>{competition.status.replaceAll('_', ' ')}</span>
                <h3>{lang === 'hi' && competition.title_hi ? competition.title_hi : competition.title}</h3>
                <p>{competition.description || competitionType(competition.type)}</p>
                <div className={styles.competitionMeta}>
                  <span>🏆 {competitionType(competition.type)}</span>
                  <span>📅 {competitionDate(competition.start_time)}</span>
                  {competition.duration_mins ? <span>⏱️ {competition.duration_mins} min</span> : null}
                </div>
              </article>
            ))}
          </div>

          <div className={styles.heroActions} style={{ justifyContent: 'center' }}>
            <button className={styles.darkButton} onClick={() => router.push('/competition')}>{t('View All Competitions', 'सभी प्रतियोगिताएँ देखें')}</button>
          </div>

          <div className={styles.statsStrip} aria-label="Current platform database counts">
            {allMetrics.map(([value, label]) => (
              <div className={styles.statMini} key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <strong style={{ color: '#fff' }}>VidyaSetu</strong>
            <div style={{ marginTop: 5 }}>{t('Learning, school operations and connected support.', 'लर्निंग, स्कूल संचालन और जुड़ा हुआ सहयोग।')}</div>
          </div>
          <div className={styles.footerLinks}>
            <button onClick={() => router.push('/competition')}>{t('Competitions', 'प्रतियोगिताएँ')}</button>
            <button onClick={() => scrollTo('groups')}>{t('Groups', 'समूह')}</button>
            <button onClick={() => router.push('/login')}>{t('Login', 'लॉगिन')}</button>
            <button onClick={() => router.push('/register')}>{t('Create Account', 'खाता बनाएँ')}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
