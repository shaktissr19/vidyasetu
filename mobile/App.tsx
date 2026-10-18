import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
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
  { label: "Login", path: "/login", icon: "→" },
];

const MORE_PAGES: Page[] = [
  ...QUICK_PAGES.slice(0, 3),
  { label: "Learning library", path: "/learn/library", icon: "▦" },
  { label: "For schools", path: "/for-schools", icon: "⌂" },
  { label: "For parents", path: "/for-parents", icon: "♡" },
  { label: "Competitions", path: "/competition", icon: "☆" },
  { label: "Communities", path: "/communities", icon: "◎" },
  { label: "Platform administration", path: "/platform-admin", icon: "⚙" },
  { label: "Login", path: "/login", icon: "→" },
  { label: "Create account", path: "/register", icon: "+" },
];

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
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.appHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to VidyaSetu home"
          onPress={() => openPage(MORE_PAGES[0])}
          style={styles.brand}
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>व</Text>
          </View>
          <Text style={styles.brandName}>
            vidya<Text style={styles.brandAccent}>setu</Text>
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open app navigation"
          onPress={() => setMenuOpen(true)}
          style={styles.menuButton}
        >
          <Text style={styles.menuButtonText}>☰</Text>
          <Text style={styles.menuLabel}>Menu</Text>
        </Pressable>
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

      <View style={styles.tabBar}>
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
        <Pressable
          accessibilityRole="button"
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
  appHeader: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4EBEE",
    backgroundColor: "#FFFFFF",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#087E78",
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  brandName: { color: "#172D3D", fontSize: 18, fontWeight: "700" },
  brandAccent: { color: "#087E78" },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#F2F7F7",
  },
  menuButtonText: { color: "#087E78", fontSize: 18 },
  menuLabel: { color: "#172D3D", fontSize: 13, fontWeight: "600" },
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
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  loadingText: { color: "#536872", fontSize: 15 },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  tabBar: {
    minHeight: 60,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E4EBEE",
    backgroundColor: "#FFFFFF",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
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