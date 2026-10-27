import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { MOBILE_NAV_THEME } from "../shared/ui/mobileNavigationTheme";

// Expo can point the app at a staging deployment for validation. Production
// remains the default so an ordinary Expo Go build opens the live website.
const SITE_URL = (process.env.EXPO_PUBLIC_WEB_URL || "https://vidyasetu.sbs").replace(/\/+$/, "");
const SITE_ORIGIN = new URL(SITE_URL).origin;

type Page = {
  label: string;
  path: string;
  icon: string;
  section?: string;
};

type UserRole = "STUDENT" | "PARENT" | "TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN";
type NativeUser = { role: UserRole; name?: string };

const PUBLIC_TABS: Page[] = [
  { label: "Home", path: "/", icon: "⌂" },
  { label: "Learn", path: "/learn", icon: "▤" },
  { label: "Students", path: "/for-students", icon: "🎓" },
  { label: "Schools", path: "/for-schools", icon: "▦" },
  { label: "Parents", path: "/for-parents", icon: "👪" },
  { label: "Competitions", path: "/competition", icon: "☆" },
  { label: "Communities", path: "/communities", icon: "◎" },
];

const PUBLIC_MORE_PAGES: Page[] = [
  { section: "Explore VidyaSetu", label: "Learning library", path: "/learn/library", icon: "▤" },
  { section: "Explore VidyaSetu", label: "For students", path: "/for-students", icon: "◉" },
  { section: "Explore VidyaSetu", label: "For schools", path: "/for-schools", icon: "▦" },
  { section: "Explore VidyaSetu", label: "For parents", path: "/for-parents", icon: "👪" },
  { section: "Explore VidyaSetu", label: "Competitions", path: "/competition", icon: "☆" },
  { section: "Explore VidyaSetu", label: "Communities", path: "/communities", icon: "◎" },
];

const ROLE_TABS: Record<UserRole, Page[]> = {
  STUDENT: [
    { label: "Home", path: "/student?section=dashboard", icon: "⌂" },
    { label: "Learning", path: "/student?section=subjects", icon: "▤" },
    { label: "Syllabus", path: "/syllabus", icon: "▣" },
  ],
  PARENT: [
    { label: "Overview", path: "/parent/dashboard", icon: "⌂" },
    { label: "Messages", path: "/parent/messages", icon: "✉" },
    { label: "Alerts", path: "/parent/notifications", icon: "♢" },
  ],
  TEACHER: [
    { label: "Overview", path: "/school/overview", icon: "⌂" },
    { label: "Attendance", path: "/school/attendance", icon: "✓" },
    { label: "Homework", path: "/school/homework", icon: "▤" },
  ],
  SCHOOL_ADMIN: [
    { label: "Overview", path: "/school/overview", icon: "⌂" },
    { label: "Students", path: "/school/students", icon: "◉" },
    { label: "Classes", path: "/school/classes", icon: "▦" },
  ],
  SUPER_ADMIN: [
    { label: "Analytics", path: "/admin/analytics", icon: "▥" },
    { label: "Schools", path: "/admin/schools", icon: "▦" },
    { label: "Content", path: "/admin/learning", icon: "▤" },
  ],
};

const ROLE_MORE_PAGES: Record<UserRole, Page[]> = {
  STUDENT: [
    { section: "My learning", label: "Dashboard", path: "/student?section=dashboard", icon: "⌂" },
    { section: "My learning", label: "Learning", path: "/student?section=subjects", icon: "▤" },
    { section: "My learning", label: "My Syllabus", path: "/syllabus", icon: "▣" },
    { section: "My learning", label: "Homework", path: "/student?section=homework", icon: "✎" },
    { section: "My learning", label: "AI Tutor", path: "/student?section=ai", icon: "✦" },
    { section: "My learning", label: "Doubt Forum", path: "/student?section=doubts", icon: "?" },
    { section: "My learning", label: "Competitions", path: "/student?section=exams", icon: "☆" },
    { section: "My learning", label: "Communities", path: "/student?section=groups", icon: "◎" },
    { section: "My school", label: "Attendance", path: "/student?section=attendance", icon: "✓" },
    { section: "My school", label: "Leave & calendar", path: "/student?section=leave", icon: "◷" },
    { section: "My school", label: "Transport & safety", path: "/student?section=transport", icon: "▰" },
    { section: "My school", label: "Records & certificates", path: "/student?section=documents", icon: "▧" },
    { section: "My school", label: "My school", path: "/student?section=school", icon: "⌂" },
    { section: "My account", label: "Report card", path: "/student?section=report", icon: "▤" },
    { section: "My account", label: "Notifications", path: "/student?section=notifications", icon: "♢" },
    { section: "My account", label: "Offline mode", path: "/student?section=offline", icon: "⇩" },
    { section: "My account", label: "Profile & security", path: "/student?section=profile", icon: "◉" },
    ...PUBLIC_MORE_PAGES,
  ],
  PARENT: [
    { section: "Child overview", label: "Overview", path: "/parent/dashboard", icon: "⌂" },
    { section: "Child overview", label: "Homework", path: "/parent/homework", icon: "✎" },
    { section: "Child overview", label: "Learning support", path: "/parent/learning-support", icon: "👪" },
    { section: "Child overview", label: "Performance", path: "/parent/performance", icon: "▥" },
    { section: "Child overview", label: "Competitions & achievements", path: "/parent/achievements", icon: "☆" },
    { section: "School connection", label: "PTM & follow-up", path: "/parent/ptm", icon: "◷" },
    { section: "School connection", label: "Attendance", path: "/parent/attendance", icon: "✓" },
    { section: "School connection", label: "Leave & calendar", path: "/parent/leave", icon: "◷" },
    { section: "School connection", label: "Transport & safety", path: "/parent/transport", icon: "▰" },
    { section: "School connection", label: "Records & certificates", path: "/parent/documents", icon: "▧" },
    { section: "School connection", label: "Fees", path: "/parent/fees", icon: "₹" },
    { section: "School connection", label: "Report card", path: "/parent/report-card", icon: "▤" },
    { section: "Communication", label: "Notifications", path: "/parent/notifications", icon: "♢" },
    { section: "Communication", label: "Messages to teachers", path: "/parent/messages", icon: "✉" },
    { section: "Communication", label: "Concerns & grievances", path: "/parent/grievances", icon: "⚑" },
    { section: "Communication", label: "Communities", path: "/parent/groups", icon: "◎" },
    ...PUBLIC_MORE_PAGES,
  ],
  TEACHER: [
    { section: "Teaching", label: "Overview", path: "/school/overview", icon: "⌂" },
    { section: "Teaching", label: "Students", path: "/school/students", icon: "◉" },
    { section: "Teaching", label: "Academic workspace", path: "/school/academic-workspace", icon: "▤" },
    { section: "Teaching", label: "Learning insights", path: "/school/learning-insights", icon: "◈" },
    { section: "Teaching", label: "Learning reviews", path: "/school/learning-reviews", icon: "▣" },
    { section: "Teaching", label: "Attendance", path: "/school/attendance", icon: "✓" },
    { section: "Teaching", label: "Homework", path: "/school/homework", icon: "✎" },
    { section: "Teaching", label: "Results", path: "/school/results", icon: "▥" },
    { section: "Teaching", label: "PTM & interventions", path: "/school/ptm", icon: "◷" },
    { section: "School", label: "My attendance & leave", path: "/school/staff", icon: "◷" },
    { section: "School", label: "Leave & calendar", path: "/school/absence", icon: "▦" },
    { section: "School", label: "Timetable", path: "/school/timetable", icon: "▦" },
    { section: "School", label: "Announcements", path: "/school/announcements", icon: "♢" },
    { section: "School", label: "Communities", path: "/school/groups", icon: "◎" },
    { section: "School", label: "School profile", path: "/school/profile", icon: "⌂" },
    ...PUBLIC_MORE_PAGES,
  ],
  SCHOOL_ADMIN: [
    { section: "School management", label: "Overview", path: "/school/overview", icon: "⌂" },
    { section: "School management", label: "Enrollment requests", path: "/school/enrollments", icon: "✓" },
    { section: "School management", label: "Students", path: "/school/students", icon: "◉" },
    { section: "School management", label: "Classes & sections", path: "/school/classes", icon: "▦" },
    { section: "School management", label: "Teachers", path: "/school/teachers", icon: "◉" },
    { section: "School management", label: "Staff attendance & leave", path: "/school/staff", icon: "◷" },
    { section: "School management", label: "School profile", path: "/school/profile", icon: "⌂" },
    { section: "Academics", label: "Academic workspace", path: "/school/academic-workspace", icon: "▤" },
    { section: "Academics", label: "Learning insights", path: "/school/learning-insights", icon: "◈" },
    { section: "Academics", label: "PTM & interventions", path: "/school/ptm", icon: "◷" },
    { section: "Academics", label: "Attendance", path: "/school/attendance", icon: "✓" },
    { section: "Academics", label: "Homework", path: "/school/homework", icon: "✎" },
    { section: "Academics", label: "Exams", path: "/school/exams", icon: "▣" },
    { section: "Academics", label: "Results", path: "/school/results", icon: "▥" },
    { section: "School operations", label: "Transport & safety", path: "/school/transport", icon: "▰" },
    { section: "School operations", label: "Records & certificates", path: "/school/documents", icon: "▧" },
    { section: "School operations", label: "Leave & calendar", path: "/school/absence", icon: "◷" },
    { section: "School operations", label: "Fees", path: "/school/fees", icon: "₹" },
    { section: "School operations", label: "Timetable", path: "/school/timetable", icon: "▦" },
    { section: "School operations", label: "Announcements", path: "/school/announcements", icon: "♢" },
    { section: "School operations", label: "Parent concerns", path: "/school/grievances", icon: "⚑" },
    { section: "School operations", label: "Communities", path: "/school/groups", icon: "◎" },
    ...PUBLIC_MORE_PAGES,
  ],
  SUPER_ADMIN: [
    { section: "Platform", label: "Analytics", path: "/admin/analytics", icon: "▥" },
    { section: "Platform", label: "Schools", path: "/admin/schools", icon: "▦" },
    { section: "Platform", label: "Users", path: "/admin/users", icon: "◉" },
    { section: "Learning", label: "Syllabus", path: "/admin/learning/syllabus", icon: "▣" },
    { section: "Learning", label: "Content Factory", path: "/admin/learning/factory", icon: "⚙" },
    { section: "Learning", label: "Topic Assets", path: "/admin/learning/governance", icon: "✦" },
    { section: "Learning", label: "Content Library", path: "/admin/learning", icon: "▤" },
    { section: "Learning", label: "Coverage", path: "/admin/learning/coverage", icon: "◎" },
    { section: "Learning", label: "Question Bank", path: "/admin/learning/practice", icon: "?" },
    { section: "Learning", label: "Bulk Import", path: "/admin/learning/imports", icon: "⇩" },
    { section: "Learning", label: "Diagnostics", path: "/admin/learning/diagnostics", icon: "◈" },
    { section: "Operations", label: "Competitions", path: "/admin/competitions", icon: "☆" },
    { section: "Operations", label: "Communities", path: "/admin/groups", icon: "◎" },
    { section: "Operations", label: "Grievances", path: "/admin/grievances", icon: "⚑" },
    { section: "Operations", label: "Revenue", path: "/admin/revenue", icon: "₹" },
    { section: "Operations", label: "Support", path: "/admin/support", icon: "?" },
    { section: "Operations", label: "Audit trail", path: "/admin/audit", icon: "▧" },
    { section: "Operations", label: "Settings", path: "/admin/settings", icon: "⚙" },
    ...PUBLIC_MORE_PAGES,
  ],
};

// The website remains the source of truth for page content and behavior. These
// styles adapt its shared chrome and common layouts only inside the native app.
const APP_LAYOUT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { width: 100%; max-width: 100%; overflow-x: hidden !important; }
  img, video, canvas, iframe { max-width: 100%; }
  table { max-width: 100%; }
  header[style*="min-height: 66px"] {
    box-sizing: border-box !important; width: 100% !important; max-width: 100vw !important;
    padding-left: 12px !important; padding-right: 12px !important; gap: 8px !important;
    overflow: hidden !important;
  }
  html.vidyasetu-native-app .global-topbar { display: none !important; }
  /* Native chrome is rendered by React Native so the website's wide desktop
     header cannot clip Dashboard/Logout or compete with the app menu. */
  html.vidyasetu-native-app header[style*="min-height: 66px"] { display: none !important; }
  html.vidyasetu-native-app .mobile-bottom-nav { display: none !important; }
  html.vidyasetu-native-app .role-mobile-toolbar,
  html.vidyasetu-native-app .admin-mobile-toolbar,
  html.vidyasetu-native-app .role-mobile-backdrop,
  html.vidyasetu-native-app .admin-mobile-backdrop { display: none !important; }
  header[style*="min-height: 66px"] > nav {
    min-width: 0 !important; flex: 1 1 0 !important; justify-content: flex-start !important;
    overflow-x: auto !important; overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important; touch-action: pan-x !important;
    scrollbar-width: thin !important;
  }
  @media (max-width: 680px) {
    header[style*="min-height: 66px"] {
      min-height: 0 !important; height: auto !important; flex-direction: column !important;
      align-items: stretch !important; flex-wrap: nowrap !important; gap: 8px !important;
      padding-top: 8px !important; padding-bottom: 9px !important; overflow: visible !important;
    }
    header[style*="min-height: 66px"] > nav { display: none !important; }
    header[style*="min-height: 66px"] > a > div:first-child {
      width: 32px !important; height: 32px !important; font-size: 16px !important;
    }
    header[style*="min-height: 66px"] > a > div:last-child {
      font-size: 21px !important; white-space: nowrap !important;
    }
    header[style*="min-height: 66px"] > div {
      width: 100% !important; margin-left: 0 !important; justify-content: flex-end !important;
      flex-wrap: wrap !important; gap: 7px !important;
    }
    header[style*="min-height: 66px"] > div > button {
      display: inline-flex !important; align-items: center !important; justify-content: center !important;
      flex: 0 1 auto !important; min-width: 74px !important; min-height: 44px !important;
      padding: 8px 12px !important; font-size: 13px !important; line-height: 1.2 !important;
      white-space: normal !important;
    }
    header[style*="min-height: 66px"] > div > button:first-child {
      flex: 0 0 60px !important; min-width: 60px !important; width: 60px !important;
    }
    header[style*="min-height: 66px"] > div > button:nth-child(3) {
      min-width: 128px !important;
    }
    input, select, textarea { max-width: 100% !important; font-size: 16px !important; }
    button, a { overflow-wrap: anywhere; }
    [class*="heroActions"], [class*="actions"] {
      flex-direction: column !important; align-items: stretch !important;
    }
    [class*="heroActions"] > a, [class*="heroActions"] > button,
    [class*="actions"] > a, [class*="actions"] > button {
      width: 100% !important; min-width: 0 !important; min-height: 48px !important;
      flex: 1 1 auto !important; white-space: normal !important; text-align: center !important;
    }
    [class*="heroTitle"] { font-size: clamp(32px, 8.5vw, 38px) !important; line-height: 1.08 !important; }
    [class*="homeHero"] h1, [class*="compactHero"] h1 { font-size: clamp(32px, 8.5vw, 38px) !important; line-height: 1.08 !important; }
    .dash-layout {
      height: auto !important; min-height: calc(100dvh - 118px) !important;
      flex-direction: column !important; overflow: visible !important;
    }
    .dash-sidebar {
      position: sticky !important; top: 56px !important; z-index: 80 !important;
      display: block !important; width: 100% !important; height: 54px !important;
      max-height: 54px !important; flex: 0 0 54px !important; padding: 4px !important;
      overflow-x: auto !important; overflow-y: hidden !important;
      -webkit-overflow-scrolling: touch !important;
    }
    .dash-sidebar > div:first-child, .dash-sidebar > div:last-child { display: none !important; }
    .dash-sidebar > nav {
      display: flex !important; width: max-content !important; gap: 4px !important;
      margin: 0 !important; padding: 0 !important;
    }
    .dash-sidebar .sidebar-link {
      min-height: 44px !important; padding: 8px 12px !important;
      border-left: 0 !important; border-bottom: 2px solid transparent !important;
      white-space: nowrap !important;
    }
    .dash-sidebar .sidebar-link.active { border-bottom-color: var(--saffron) !important; }
    .dash-main {
      min-width: 0 !important; overflow: visible !important; padding: 14px !important;
    }
    table { display: block !important; width: 100% !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }
  }
  @media (max-width: 760px) {
    section[class*="hero__"]:has(> [class*="photo"]),
    section[class*="hero__"]:has(> [class*="heroPhoto"]) {
      display: grid !important; height: auto !important; min-height: 0 !important;
      grid-template-rows: clamp(170px, 52vw, 235px) auto !important;
    }
    section[class*="hero__"]:has(> [class*="photo"]) > [class*="photo"],
    section[class*="hero__"]:has(> [class*="heroPhoto"]) > [class*="heroPhoto"] {
      position: relative !important; inset: auto !important; grid-row: 1 !important;
      width: 100% !important; height: clamp(170px, 52vw, 235px) !important;
    }
    section[class*="hero__"]:has(> [class*="photo"]) > [class*="content"],
    section[class*="hero__"]:has(> [class*="heroPhoto"]) > [class*="heroShell"] {
      grid-row: 2 !important; width: 100% !important; max-width: 100% !important;
      height: auto !important; min-height: 0 !important; padding: 22px 18px 24px !important;
    }
    section[class*="hero__"]:has(> [class*="photo"]) > [class*="wash"],
    section[class*="hero__"]:has(> [class*="heroPhoto"]) > [class*="heroFade"] { display: none !important; }
    section[class*="hero__"]:has(> [class*="heroPhoto"]) [class*="heroContent"] {
      width: 100% !important; max-width: none !important;
    }
    section[class*="hero__"]:has(> [class*="heroPhoto"]) h1 {
      font-size: clamp(32px, 8.5vw, 38px) !important; line-height: 1.08 !important;
    }
  }
  @media (max-width: 360px) {
    header[style*="min-height: 66px"] > div { gap: 5px !important; }
    header[style*="min-height: 66px"] > div > button { padding-left: 6px !important; padding-right: 6px !important; font-size: 12px !important; }
    header[style*="min-height: 66px"] > div > button:first-child { flex-basis: 52px !important; min-width: 52px !important; width: 52px !important; }
    header[style*="min-height: 66px"] > div > button:nth-child(3) { min-width: 120px !important; }
  }
  html.vidyasetu-native-app header[style*="min-height: 66px"] > nav { display: none !important; }
  html.vidyasetu-native-app .dash-layout {
    display: block !important; height: auto !important; min-height: 0 !important;
    overflow: visible !important;
  }
  html.vidyasetu-native-app .dash-sidebar { display: none !important; }
  html.vidyasetu-native-app .dash-main {
    display: block !important; width: 100% !important; max-width: 100% !important;
    min-width: 0 !important; min-height: 0 !important; margin: 0 !important;
    overflow: visible !important;
  }
  html.vidyasetu-native-app [class*="StudentPortal_sidebar"],
  html.vidyasetu-native-app [class*="StudentPortal_mobileMenu"] { display: none !important; }
  html.vidyasetu-native-app [class*="StudentPortal_layout"] { padding-top: 0 !important; }
  html.vidyasetu-native-app [class*="StudentPortal_main"] {
    width: 100% !important; margin: 0 !important; padding: 18px 16px 30px !important;
  }
  @media (max-width: 1024px) {
    html.vidyasetu-native-app .dash-main { padding: 20px 18px 32px !important; }
    html.vidyasetu-native-app h1 { font-size: clamp(30px, 4.5vw, 42px) !important; line-height: 1.14 !important; }
    html.vidyasetu-native-app h2 { font-size: clamp(24px, 3.2vw, 32px) !important; line-height: 1.2 !important; }
    html.vidyasetu-native-app h3 { font-size: clamp(20px, 2.8vw, 27px) !important; line-height: 1.25 !important; }
    html.vidyasetu-native-app .card { padding: 20px !important; }
  }
  @media (max-width: 760px) {
    html.vidyasetu-native-app .dash-main { padding: 18px 16px 30px !important; }
    html.vidyasetu-native-app h1 { font-size: clamp(27px, 7vw, 34px) !important; line-height: 1.12 !important; }
    html.vidyasetu-native-app h2 { font-size: clamp(21px, 5.5vw, 27px) !important; line-height: 1.2 !important; }
    html.vidyasetu-native-app h3 { font-size: clamp(18px, 4.8vw, 22px) !important; line-height: 1.25 !important; }
    html.vidyasetu-native-app p, html.vidyasetu-native-app li { line-height: 1.55 !important; }
    html.vidyasetu-native-app .card { padding: 16px !important; border-radius: 14px !important; }
    html.vidyasetu-native-app [class*="StudentPortal_card"],
    html.vidyasetu-native-app [class*="StudentPortal_stat"] { padding: 16px !important; }
  }
`;

const APP_LAYOUT_SCRIPT = `(function(){
  var id='vidyasetu-native-layout';
  function apply(){
    if(!document.head){ document.addEventListener('DOMContentLoaded',apply,{once:true}); return; }
    var style=document.getElementById(id);
    if(!style){ style=document.createElement('style'); style.id=id; document.head.appendChild(style); }
    var css=${JSON.stringify(APP_LAYOUT_CSS)};
    if(style.textContent!==css) style.textContent=css;
    document.documentElement.classList.add('vidyasetu-native-app');
    if(location.origin===${JSON.stringify(SITE_ORIGIN)} && window.ReactNativeWebView){
      if(window.__vidyasetuNativeAuthTimer) clearInterval(window.__vidyasetuNativeAuthTimer);
      var last='';
      var sendAuth=function(){
        try{
          var saved=JSON.parse(localStorage.getItem('vidyasetu-auth')||'{}');
          var state=saved.state||{}; var user=state.user||null;
          var languageState=JSON.parse(localStorage.getItem('vidyasetu-lang')||'{}').state||{};
          var language=languageState.lang==='en'?'en':'hi';
          var value=JSON.stringify({type:'vidyasetu-auth',origin:location.origin,isLoggedIn:!!state.isLoggedIn,role:user&&user.role,name:user&&user.name||null,language:language});
          if(value!==last){last=value;window.ReactNativeWebView.postMessage(value);}
        }catch(_e){}
      };
      sendAuth(); window.__vidyasetuNativeAuthTimer=setInterval(sendAuth,1200);
    }
  }
  apply();
  true;
})();`;

function AppContent() {
  const { width: windowWidth } = useWindowDimensions();
  const compactHeader = windowWidth < 420;
  const webView = useRef<WebView>(null);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentUrl, setCurrentUrl] = useState(SITE_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadError, setLoadError] = useState("Check your internet connection, then try again.");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [nativeUser, setNativeUser] = useState<NativeUser | null>(null);
  const [siteLanguage, setSiteLanguage] = useState<"en" | "hi">("hi");
  const [showTabScrollHint, setShowTabScrollHint] = useState(false);
  const [tabContentFits, setTabContentFits] = useState(false);

  const tabs = nativeUser ? ROLE_TABS[nativeUser.role] : PUBLIC_TABS;
  const menuPages = nativeUser ? ROLE_MORE_PAGES[nativeUser.role] : PUBLIC_MORE_PAGES;
  const visibleMenuPages = menuPages.filter((page) =>
    `${page.section || ""} ${page.label}`.toLowerCase().includes(menuSearch.trim().toLowerCase()),
  );

  const finishLoading = () => {
    if (loadTimeout.current) clearTimeout(loadTimeout.current);
    loadTimeout.current = null;
    setLoading(false);
  };

  const beginLoading = () => {
    if (loadTimeout.current) clearTimeout(loadTimeout.current);
    setFailed(false);
    setLoading(true);
    loadTimeout.current = setTimeout(() => {
      loadTimeout.current = null;
      setLoading(false);
      setLoadError("This page did not finish loading. Check your connection and try again.");
      setFailed(true);
    }, 25000);
  };

  useEffect(() => () => {
    if (loadTimeout.current) clearTimeout(loadTimeout.current);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (menuOpen) {
          setMenuOpen(false);
          return true;
        }
        if (!canGoBack) return false;
        webView.current?.goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canGoBack, menuOpen]);

  const onNavigationStateChange = (navigation: WebViewNavigation) => {
    setCurrentUrl(navigation.url);
    setCanGoBack(navigation.canGoBack);
  };

  const openPage = (page: Page) => {
    const destination = new URL(page.path, SITE_URL).toString();
    setMenuOpen(false);
    beginLoading();
    webView.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(destination)}; true;`,
    );
  };

  const openMenu = () => { setMenuSearch(""); setMenuOpen(true); };
  const openDashboard = () => {
    if (nativeUser) openPage(ROLE_TABS[nativeUser.role][0]);
  };
  const toggleSiteLanguage = () => {
    webView.current?.injectJavaScript(`(function(){var button=document.querySelector('button[aria-label="Switch language"]');if(button)button.click();return true;})();`);
  };
  const logoutFromWebsite = () => {
    // Reuse the website's existing logout flow so the API, persisted auth state,
    // tracked session, and redirect all stay consistent with the web app.
    webView.current?.injectJavaScript(`(function(){
      var action=Array.from(document.querySelectorAll('button,a,[role="button"]')).find(function(item){return /^log\\s*out$/i.test((item.textContent||'').replace(/\\s+/g,' ').trim());});
      if(action){action.click();return true;}
      window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'vidyasetu-logout-unavailable'}));
      return false;
    })(); true;`);
  };

  const activePath = (() => {
    try {
      return new URL(currentUrl).pathname.replace(/\/$/, "") || "/";
    } catch {
      return "/";
    }
  })();

  const isPageActive = (page: Page) => {
    try {
      const current = new URL(currentUrl);
      const target = new URL(page.path, SITE_URL);
      if (target.pathname !== current.pathname) return false;
      for (const [key, value] of target.searchParams) {
        if (current.searchParams.get(key) !== value) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={MOBILE_NAV_THEME.orange} />
      <View style={[styles.appHeader, compactHeader && styles.compactAppHeader]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          accessibilityState={{ expanded: menuOpen }}
          onPress={openMenu}
          style={[styles.headerMenuButton, compactHeader && styles.compactHeaderMenuButton]}
        >
          <Text style={styles.headerMenuIcon}>{menuOpen ? "×" : "☰"}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="VidyaSetu home" onPress={() => openPage({ label: "Home", path: "/", icon: "⌂" })} style={[styles.brand, compactHeader && styles.compactBrand]}>
          <View style={[styles.brandMark, compactHeader && styles.compactBrandMark]}><Text style={styles.brandMarkText}>V</Text></View>
          <Text numberOfLines={1} style={[styles.brandText, compactHeader && styles.compactBrandText]}>Vidya<Text style={styles.brandAccent}>Setu</Text></Text>
        </Pressable>
        <View style={[styles.headerActions, compactHeader && styles.compactHeaderActions]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={siteLanguage === "hi" ? "Switch language to English" : "भाषा हिंदी में बदलें"}
            onPress={toggleSiteLanguage}
            style={[styles.headerActionButton, styles.languageButton, compactHeader && styles.compactHeaderActionButton]}
          >
            <Text style={styles.headerActionText}>{siteLanguage === "hi" ? "EN" : "हिंदी"}</Text>
          </Pressable>
          {nativeUser ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="Open my dashboard" onPress={openDashboard} style={styles.headerActionButton}>
                <Text style={styles.headerActionText}>Dashboard</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={logoutFromWebsite} style={[styles.headerActionButton, styles.headerLogoutButton]}>
                <Text style={[styles.headerActionText, styles.headerLogoutText]}>Log out</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => openPage({ label: "Login", path: "/login", icon: "→" })} style={[styles.headerActionButton, compactHeader && styles.compactHeaderActionButton]}>
                <Text style={styles.headerActionText}>Login</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Create account" onPress={() => openPage({ label: "Create account", path: "/register", icon: "+" })} style={[styles.headerActionButton, styles.createAccountButton, compactHeader && styles.compactHeaderActionButton]}>
                <Text style={[styles.headerActionText, styles.createAccountText, compactHeader && styles.compactCreateAccountText]}>Create account</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
      <View style={styles.webContainer}>
        <WebView
          ref={webView}
          source={{ uri: SITE_URL }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          pullToRefreshEnabled
          allowsBackForwardNavigationGestures
          injectedJavaScriptBeforeContentLoaded={APP_LAYOUT_SCRIPT}
          injectedJavaScript={APP_LAYOUT_SCRIPT}
          onLoadStart={beginLoading}
          onLoadEnd={() => {
            finishLoading();
          }}
          onLoad={() => setFailed(false)}
          onLoadProgress={({ nativeEvent }) => {
            if (nativeEvent.progress >= 1) finishLoading();
          }}
          onError={({ nativeEvent }) => {
            finishLoading();
            setLoadError(nativeEvent.description || "VidyaSetu could not load this page. Check your connection and retry.");
            setFailed(true);
          }}
          onHttpError={({ nativeEvent }) => {
            if (nativeEvent.url === currentUrl) {
              finishLoading();
              setLoadError(`The page returned an HTTP ${nativeEvent.statusCode} error. Try again in a moment.`);
              setFailed(true);
            }
          }}
          onNavigationStateChange={(navigation) => {
            onNavigationStateChange(navigation);
            if (navigation.loading === false) {
              finishLoading();
            }
          }}
          onMessage={(event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data) as {
                type?: string;
                origin?: string;
                isLoggedIn?: boolean;
                role?: string;
                name?: string | null;
                language?: "en" | "hi";
              };
              if (message.language === "en" || message.language === "hi") setSiteLanguage(message.language);
              const roles: UserRole[] = ["STUDENT", "PARENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"];
              if (message.type !== "vidyasetu-auth" || message.origin !== SITE_ORIGIN || new URL(currentUrl).origin !== SITE_ORIGIN) return;
              if (!message.isLoggedIn || !roles.includes(message.role as UserRole)) {
                setNativeUser(null);
                return;
              }
              setNativeUser({ role: message.role as UserRole, name: message.name || undefined });
            } catch {
              // Ignore unrelated messages from website content.
            }
          }}
        />
        {loading && (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FF6B00" />
            <Text style={styles.loadingText}>Opening VidyaSetu…</Text>
          </View>
        )}
        {failed && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Could not load this page</Text>
            <Text style={styles.errorText}>
              {loadError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                beginLoading();
                webView.current?.reload();
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>

      <SafeAreaView style={styles.tabBarSafeArea} edges={["bottom"]}>
        <View style={styles.tabBarScroller}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabBar, tabContentFits && styles.tabBarCentered]}
            accessibilityLabel="Primary app navigation"
            accessibilityHint="Swipe left or right to see more destinations."
            onContentSizeChange={(contentWidth) => {
              const fits = contentWidth <= windowWidth;
              setTabContentFits(fits);
              setShowTabScrollHint(!fits);
            }}
            onScroll={({ nativeEvent }) => {
              const canScrollFurther = nativeEvent.contentOffset.x + nativeEvent.layoutMeasurement.width < nativeEvent.contentSize.width - 2;
              setShowTabScrollHint((current) => current === canScrollFurther ? current : canScrollFurther);
            }}
            scrollEventThrottle={16}
          >
          {tabs.map((page) => {
            const active = isPageActive(page) || (!page.path.includes("?") && activePath.startsWith(`${page.path}/`));
            return (
              <Pressable
                key={page.path}
                accessibilityRole="tab"
                accessibilityLabel={page.label}
                accessibilityState={{ selected: active }}
                onPress={() => openPage(page)}
                style={[styles.tab, active && styles.activeTab]}
              >
                <Text style={[styles.tabIcon, active && styles.activeTabText]}>
                  {page.icon}
                </Text>
                <Text style={[styles.tabLabel, active && styles.activeTabText]}>
                  {page.label}
                </Text>
              </Pressable>
            );
          })}
          </ScrollView>
          {showTabScrollHint && <View pointerEvents="none" style={styles.tabScrollHint}><Text style={styles.tabScrollHintText}>›</Text></View>}
        </View>
      </SafeAreaView>

      <Modal
        visible={menuOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={() => setMenuOpen(false)} style={styles.drawerScrim} />
          <SafeAreaView style={styles.menuScreen} edges={["top", "left", "bottom"]}>
          <View style={styles.menuHeader}>
            <View>
              {nativeUser ? (
                <>
                  <Text style={styles.menuEyebrow}>{nativeUser.role.replaceAll("_", " ")}</Text>
                  <Text style={styles.menuTitle}>{nativeUser.name ? `Welcome, ${nativeUser.name.split(" ")[0]}` : "Your workspace"}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.menuEyebrow}>VIDYASETU</Text>
                  <Text style={styles.menuTitle}>Explore the platform</Text>
                </>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close navigation"
              onPress={() => setMenuOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.menuSearchWrap}>
            <TextInput
              accessibilityLabel="Search pages"
              placeholder={nativeUser ? "Search your workspace" : "Search pages"}
              placeholderTextColor="#667085"
              value={menuSearch}
              onChangeText={setMenuSearch}
              style={styles.menuSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <FlatList
            data={visibleMenuPages}
            keyExtractor={(page) => page.path}
            contentContainerStyle={styles.menuList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <View>
                {(index === 0 || visibleMenuPages[index - 1]?.section !== item.section) && !!item.section && (
                  <Text style={styles.menuSectionTitle}>{item.section}</Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: isPageActive(item) }}
                  onPress={() => openPage(item)}
                  style={[styles.menuItem, isPageActive(item) && styles.menuItemActive]}
                >
                  <View style={styles.menuIconBox}>
                    <Text style={styles.menuIcon}>{item.icon}</Text>
                  </View>
                  <Text style={styles.menuItemText}>{item.label}</Text>
                  {isPageActive(item) ? <Text style={styles.menuCurrent}>Current</Text> : <Text style={styles.menuChevron}>›</Text>}
                </Pressable>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.menuEmpty}>No pages match “{menuSearch}”.</Text>}
            ListFooterComponent={
              <Text style={styles.menuFootnote}>
                {nativeUser
                  ? "Workspace pages use your VidyaSetu account permissions. Public learning and information pages remain available here."
                  : "Explore public pages without signing in. Login and account creation use the existing VidyaSetu website."}
              </Text>
            }
          />
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MOBILE_NAV_THEME.orange },
  tabBarSafeArea: { backgroundColor: MOBILE_NAV_THEME.orange },
  appHeader: {
    minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 8,
    gap: 6, backgroundColor: MOBILE_NAV_THEME.orange, borderBottomWidth: 1, borderBottomColor: MOBILE_NAV_THEME.orangeEdge,
  },
  compactAppHeader: { minHeight: 58, paddingHorizontal: 4, gap: 3 },
  headerMenuButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: MOBILE_NAV_THEME.cream, borderWidth: 1, borderColor: MOBILE_NAV_THEME.buttonBorder },
  compactHeaderMenuButton: { width: 34, height: 44 },
  headerMenuIcon: { color: MOBILE_NAV_THEME.navy, fontSize: 22, fontWeight: "800" },
  brand: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1, minWidth: 0 },
  compactBrand: { gap: 4 },
  brandMark: { width: 29, height: 29, borderRadius: 8, backgroundColor: MOBILE_NAV_THEME.navy, alignItems: "center", justifyContent: "center" },
  compactBrandMark: { width: 27, height: 27, borderRadius: 7 },
  brandMarkText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  brandText: { color: MOBILE_NAV_THEME.navy, fontSize: 17, fontWeight: "900" },
  compactBrandText: { fontSize: 14, flexShrink: 1 },
  brandAccent: { color: MOBILE_NAV_THEME.navy },
  headerActions: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 },
  compactHeaderActions: { gap: 3 },
  headerActionButton: { minHeight: 44, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: MOBILE_NAV_THEME.cream, borderWidth: 1, borderColor: MOBILE_NAV_THEME.buttonBorder },
  compactHeaderActionButton: { paddingHorizontal: 5 },
  headerActionText: { color: MOBILE_NAV_THEME.navy, fontSize: 12, fontWeight: "800" },
  languageButton: { minWidth: 38, paddingHorizontal: 6 },
  createAccountButton: { backgroundColor: MOBILE_NAV_THEME.navy, borderColor: MOBILE_NAV_THEME.navy, paddingHorizontal: 8 },
  createAccountText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  compactCreateAccountText: { fontSize: 10 },
  headerLogoutButton: { borderWidth: 1, borderColor: MOBILE_NAV_THEME.navy, backgroundColor: MOBILE_NAV_THEME.cream },
  headerLogoutText: { color: MOBILE_NAV_THEME.navy },
  webContainer: { flex: 1, backgroundColor: "#FFFFFF" },
  webView: { flex: 1, backgroundColor: "#FFFFFF" },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.76)",
  },
  loadingText: { color: "#536872", fontSize: 15 },
  errorOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "#FFFFFF",
  },
  errorTitle: {
    color: "#172D3D",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    color: "#536872",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: MOBILE_NAV_THEME.orange,
    borderWidth: 1,
    borderColor: MOBILE_NAV_THEME.orangeEdge,
  },
  retryText: { color: MOBILE_NAV_THEME.navy, fontSize: 15, fontWeight: "800" },
  tabBarScroller: {
    position: "relative",
    minHeight: 66,
    backgroundColor: MOBILE_NAV_THEME.orange,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: MOBILE_NAV_THEME.orangeEdge,
  },
  tabScrollHint: { position: "absolute", top: 0, right: 0, bottom: 0, width: 22, alignItems: "center", justifyContent: "center", backgroundColor: MOBILE_NAV_THEME.orange },
  tabScrollHintText: { color: MOBILE_NAV_THEME.navy, fontSize: 25, fontWeight: "700", lineHeight: 28 },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 66,
    paddingHorizontal: 8,
    paddingTop: 5,
    gap: 3,
    flexGrow: 1,
  },
  tabBarCentered: { justifyContent: "center" },
  tab: { flexGrow: 0, minWidth: 72, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 1, borderRadius: 12, paddingHorizontal: 8 },
  activeTab: { backgroundColor: MOBILE_NAV_THEME.cream },
  tabIcon: { color: MOBILE_NAV_THEME.navy, fontSize: 20, lineHeight: 23 },
  tabLabel: { color: MOBILE_NAV_THEME.navy, fontSize: 12, fontWeight: "800", textAlign: "center" },
  activeTabText: { color: MOBILE_NAV_THEME.navy, fontWeight: "900" },
  drawerOverlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(13,27,62,0.48)" },
  drawerScrim: { ...StyleSheet.absoluteFill },
  menuScreen: { flex: 1, maxWidth: 400, width: "86%", backgroundColor: "#F5F8F9", elevation: 18, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 4, height: 0 } },
  menuHeader: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4EBEE",
  },
  menuSearchWrap: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF" },
  menuSearch: { minHeight: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: "#D7DEE8", color: "#172D3D", backgroundColor: "#F8FAFC", fontSize: 16 },
  menuSectionTitle: { marginTop: 15, marginBottom: 7, paddingHorizontal: 4, color: "#8F3607", fontSize: 12, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  menuEyebrow: {
    color: "#C84F00",
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  menuTitle: {
    color: "#172D3D",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 5,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1E6",
  },
  closeText: { color: "#172D3D", fontSize: 26, lineHeight: 28 },
  menuList: { paddingHorizontal: 16, paddingVertical: 12 },
  menuItem: {
    minHeight: 58,
    paddingHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuItemActive: { borderColor: "#EBA36E", backgroundColor: "#FFF4EA" },
  menuCurrent: { color: "#8F3607", fontSize: 11, fontWeight: "800" },
  menuEmpty: { padding: 24, textAlign: "center", color: "#536872", fontSize: 15 },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#FFF1E6",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: { color: "#C84F00", fontSize: 18, fontWeight: "700" },
  menuItemText: { flex: 1, color: "#172D3D", fontSize: 15, fontWeight: "600" },
  menuChevron: { color: "#69808A", fontSize: 24 },
  menuFootnote: {
    marginTop: 12,
    marginBottom: 24,
    paddingHorizontal: 4,
    color: "#69808A",
    fontSize: 12,
    lineHeight: 18,
  },
});
