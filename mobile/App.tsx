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

const QUICK_PAGES: Page[] = [
  { label: "Home", path: "/", icon: "⌂" },
  { label: "Learn", path: "/learn", icon: "▤" },
  { label: "Students", path: "/for-students", icon: "◉" },
  { label: "Schools", path: "/for-schools", icon: "▦" },
  { label: "Parents", path: "/for-parents", icon: "♡" },
  { label: "Login", path: "/login", icon: "→" },
];

const MORE_PAGES: Page[] = [
  ...QUICK_PAGES.slice(0, 5),
  { label: "Learning library", path: "/learn/library", icon: "▦" },
  { label: "Competitions", path: "/competition", icon: "☆" },
  { label: "Communities", path: "/communities", icon: "◎" },
  { label: "Platform administration", path: "/platform-admin", icon: "⚙" },
  QUICK_PAGES[5],
  { label: "Create account", path: "/register", icon: "+" },
];

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
      min-height: 56px !important; height: 56px !important; flex-wrap: nowrap !important;
    }
    header[style*="min-height: 66px"] > nav { display: none !important; }
    header[style*="min-height: 66px"] > div > button:not(:first-child) { display: none !important; }
    header[style*="min-height: 66px"] > a > div:first-child {
      width: 34px !important; height: 34px !important; font-size: 17px !important;
    }
    header[style*="min-height: 66px"] > a > div:last-child {
      font-size: 23px !important; white-space: nowrap !important;
    }
    header[style*="min-height: 66px"] > div { margin-left: auto !important; }
    header[style*="min-height: 66px"] > div > button:first-child {
      min-height: 36px !important; padding: 6px 10px !important;
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
    [class*="heroTitle"] { font-size: clamp(34px, 9vw, 44px) !important; line-height: 1.08 !important; }
    [class*="homeHero"] h1, [class*="compactHero"] h1 { font-size: 35px !important; line-height: 1.08 !important; }
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
  }
  apply();
  true;
})();`;

function AppContent() {
  const webView = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(SITE_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    setFailed(false);
    setLoading(true);
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
          startInLoadingState
          onLoadStart={() => {
            setLoading(true);
            setFailed(false);
          }}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
          onNavigationStateChange={onNavigationStateChange}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#087E78" />
              <Text style={styles.loadingText}>Opening VidyaSetu…</Text>
            </View>
          )}
        />
        {loading && (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#087E78" />
            <Text style={styles.loadingText}>Opening VidyaSetu…</Text>
          </View>
        )}
        {failed && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Could not load VidyaSetu</Text>
            <Text style={styles.errorText}>
              Check your internet connection, then try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => webView.current?.reload()}
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
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_PAGES.map((page) => {
            const active =
              page.path === "/"
                ? activePath === "/"
                : activePath === page.path ||
                  activePath.startsWith(`${page.path}/`);
            return (
              <Pressable
                key={page.path}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => openPage(page)}
                style={styles.tab}
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
              <Text style={styles.menuEyebrow}>VIDYASETU</Text>
              <Text style={styles.menuTitle}>Explore the platform</Text>
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
            data={MORE_PAGES}
            keyExtractor={(page) => page.path}
            contentContainerStyle={styles.menuList}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
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
                Public pages open without signing in. Login and account access
                use the existing VidyaSetu website.
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
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#087E78",
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
  tab: { width: 76, minHeight: 50, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { color: "#69808A", fontSize: 18, lineHeight: 22 },
  tabLabel: { color: "#69808A", fontSize: 10, fontWeight: "600" },
  activeTabText: { color: "#087E78" },
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
    color: "#087E78",
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
    backgroundColor: "#F2F7F7",
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
    backgroundColor: "#E9F7F5",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: { color: "#087E78", fontSize: 18, fontWeight: "700" },
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
