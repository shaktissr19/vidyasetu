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
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

const SITE_URL = "https://vidyasetu.sbs";

type Page = {
  label: string;
  path: string;
  icon: string;
};

type UserRole = "STUDENT" | "PARENT" | "TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN";
type NativeUser = { role: UserRole; name?: string };

const PUBLIC_TABS: Page[] = [
  { label: "Home", path: "/", icon: "⌂" },
  { label: "Learn", path: "/learn", icon: "▤" },
  { label: "Login", path: "/login", icon: "→" },
];

const PUBLIC_MORE_PAGES: Page[] = [
  { label: "For students", path: "/for-students", icon: "◉" },
  { label: "For schools", path: "/for-schools", icon: "▦" },
  { label: "For parents", path: "/for-parents", icon: "♡" },
  { label: "Learning library", path: "/learn/library", icon: "▦" },
  { label: "Competitions", path: "/competition", icon: "☆" },
  { label: "Communities", path: "/communities", icon: "◎" },
  { label: "About platform administration", path: "/platform-admin", icon: "⚙" },
  { label: "Login", path: "/login", icon: "→" },
  { label: "Create account", path: "/register", icon: "+" },
];

const ROLE_TABS: Record<UserRole, Page[]> = {
  STUDENT: [
    { label: "Dashboard", path: "/student", icon: "⌂" },
    { label: "Learn", path: "/learn", icon: "▤" },
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
    { label: "Homework", path: "/student/homework", icon: "✎" },
    { label: "Subjects", path: "/subjects", icon: "▣" },
    { label: "Exams", path: "/exams", icon: "✓" },
    { label: "Doubts", path: "/doubts", icon: "?" },
    { label: "Notifications", path: "/student/notifications", icon: "♢" },
    ...PUBLIC_MORE_PAGES.slice(0, 6),
  ],
  PARENT: [
    { label: "Homework", path: "/parent/homework", icon: "✎" },
    { label: "Learning support", path: "/parent/learning-support", icon: "♡" },
    { label: "Performance", path: "/parent/performance", icon: "▥" },
    { label: "Attendance", path: "/parent/attendance", icon: "✓" },
    ...PUBLIC_MORE_PAGES.slice(0, 6),
  ],
  TEACHER: [
    { label: "Students", path: "/school/students", icon: "◉" },
    { label: "Academic workspace", path: "/school/academic-workspace", icon: "▤" },
    { label: "Timetable", path: "/school/timetable", icon: "▦" },
    { label: "Announcements", path: "/school/announcements", icon: "♢" },
    ...PUBLIC_MORE_PAGES.slice(0, 6),
  ],
  SCHOOL_ADMIN: [
    { label: "Teachers", path: "/school/teachers", icon: "◉" },
    { label: "Enrollments", path: "/school/enrollments", icon: "✓" },
    { label: "Attendance", path: "/school/attendance", icon: "▥" },
    { label: "Homework", path: "/school/homework", icon: "✎" },
    ...PUBLIC_MORE_PAGES.slice(0, 6),
  ],
  SUPER_ADMIN: [
    { label: "Users", path: "/admin/users", icon: "◉" },
    { label: "Syllabus", path: "/admin/learning/syllabus", icon: "▣" },
    { label: "Content Factory", path: "/admin/learning/factory", icon: "⚙" },
    { label: "Competitions", path: "/admin/competitions", icon: "☆" },
    ...PUBLIC_MORE_PAGES.slice(0, 6),
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
    if(location.origin==='https://vidyasetu.sbs' && window.ReactNativeWebView){
      if(window.__vidyasetuNativeAuthTimer) clearInterval(window.__vidyasetuNativeAuthTimer);
      var last='';
      var sendAuth=function(){
        try{
          var saved=JSON.parse(localStorage.getItem('vidyasetu-auth')||'{}');
          var state=saved.state||{}; var user=state.user||null;
          var value=JSON.stringify({type:'vidyasetu-auth',origin:location.origin,isLoggedIn:!!state.isLoggedIn,role:user&&user.role,name:user&&user.name||null});
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
  const webView = useRef<WebView>(null);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentUrl, setCurrentUrl] = useState(SITE_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadError, setLoadError] = useState("Check your internet connection, then try again.");
  const [menuOpen, setMenuOpen] = useState(false);
  const [nativeUser, setNativeUser] = useState<NativeUser | null>(null);

  const tabs = nativeUser ? ROLE_TABS[nativeUser.role] : PUBLIC_TABS;
  const menuPages = nativeUser ? ROLE_MORE_PAGES[nativeUser.role] : PUBLIC_MORE_PAGES;

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

  const activePath = (() => {
    try {
      return new URL(currentUrl).pathname.replace(/\/$/, "") || "/";
    } catch {
      return "/";
    }
  })();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
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
              };
              const roles: UserRole[] = ["STUDENT", "PARENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"];
              if (message.type !== "vidyasetu-auth" || message.origin !== SITE_URL || new URL(currentUrl).origin !== SITE_URL) return;
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

      <View style={styles.tabBarScroller}>
        <ScrollView
          horizontal
          style={styles.tabScroll}
          contentContainerStyle={styles.tabBar}
          showsHorizontalScrollIndicator
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Primary app navigation"
          accessibilityHint="Swipe left or right to view all page shortcuts. More stays on the right."
        >
          {tabs.map((page) => {
            const active =
              page.path === "/" ? activePath === "/" : activePath === page.path || activePath.startsWith(`${page.path}/`);
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open more pages"
          onPress={() => setMenuOpen(true)}
          style={styles.tab}
        >
          <Text style={styles.tabIcon}>•••</Text>
          <Text style={styles.tabLabel}>More</Text>
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <SafeAreaView style={styles.menuScreen}>
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
          <FlatList
            data={menuPages}
            keyExtractor={(page) => page.path}
            contentContainerStyle={styles.menuList}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => openPage(item)}
                style={styles.menuItem}
              >
                <View style={styles.menuIconBox}>
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                </View>
                <Text style={styles.menuItemText}>{item.label}</Text>
                <Text style={styles.menuChevron}>›</Text>
              </Pressable>
            )}
            ListFooterComponent={
              <Text style={styles.menuFootnote}>
                {nativeUser
                  ? "Workspace pages use your VidyaSetu account permissions. Public learning and information pages remain available here."
                  : "Explore public pages without signing in. Login and account creation use the existing VidyaSetu website."}
              </Text>
            }
          />
        </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
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
    backgroundColor: "#FF6B00",
  },
  retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  tabBarScroller: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 62,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E4EBEE",
    backgroundColor: "#FFFFFF",
  },
  tabScroll: { flex: 1 },
  tabBar: {
    minHeight: 62,
    paddingHorizontal: 4,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  tab: { width: 76, minHeight: 50, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 12 },
  activeTab: { backgroundColor: "#FFF1E6" },
  tabIcon: { color: "#69808A", fontSize: 18, lineHeight: 22 },
  tabLabel: { color: "#536872", fontSize: 11, fontWeight: "600" },
  activeTabText: { color: "#C84F00", fontWeight: "800" },
  menuScreen: { flex: 1, backgroundColor: "#F5F8F9" },
  menuHeader: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4EBEE",
  },
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
