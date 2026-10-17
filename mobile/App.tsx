import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";

const HOME_URL = "https://vidyasetu.sbs";

export default function App() {
  const webView = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!canGoBack) return false;
        webView.current?.goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canGoBack]);

  const onNavigationStateChange = (navigation: WebViewNavigation) => {
    setCanGoBack(navigation.canGoBack);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <WebView
        ref={webView}
        source={{ uri: HOME_URL }}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
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
});