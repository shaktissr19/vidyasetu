import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

type User = {
  id?: string;
  name?: string | null;
  role?: string;
  language?: string;
  studentCode?: string | null;
};
type Dashboard = {
  student?: {
    name?: string | null;
    class_name?: string | number | null;
    school_name?: string | null;
  };
  profile?: {
    name?: string | null;
    class_name?: string | number | null;
    school_name?: string | null;
  };
  xp?: number;
  streak?: number;
  attendance?: {
    percentage?: number;
    presentDays?: number;
    workingDays?: number;
    present_days?: number;
    working_days?: number;
  };
  subjects?: Subject[];
  badges?: unknown[];
};
type Subject = {
  id?: string;
  subjectId?: string;
  subject_id?: string;
  name?: string;
  subject_name?: string;
  title?: string;
  progressPct?: number;
  progress_pct?: number;
  progress?: number;
};
type LearningHome = {
  learner?: {
    className?: number | string;
    boardName?: string;
    schoolName?: string | null;
  };
  progress?: {
    started?: number;
    completed?: number;
    average_progress?: number;
  };
  resources?: Array<{
    id: string;
    title: string;
    subject_name?: string | null;
    progress_pct?: number;
    resource_type?: string;
  }>;
  subjects?: Subject[];
};
type Syllabus = {
  profile?: {
    boardCode?: string | null;
    gradeCode?: string;
    academicYear?: string;
    language?: string;
  };
  topics?: Array<{
    id: string;
    title: string;
    title_hi?: string;
    chapter: string;
    unit?: string;
    subject: string;
    learning_outcome?: string;
    learningOutcome?: string;
    mastered?: boolean;
    learningComplete?: boolean;
  }>;
  summary?: {
    totalTopics?: number;
    completedTopics?: number;
    masteredTopics?: number;
  } | null;
};
type Envelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string };
};

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "https://vidyasetu.sbs/api/v1"
).replace(/\/$/, "");
const COLORS = {
  ink: "#172D3D",
  muted: "#69808A",
  teal: "#087E78",
  pale: "#E9F7F5",
  blue: "#EDF3FB",
  line: "#E4EBEE",
  paper: "#F5F8F9",
  white: "#FFFFFF",
  gold: "#F3B94F",
  red: "#B84848",
};

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || payload.success === false)
    throw new Error(
      payload.error?.message || "Something went wrong. Please try again.",
    );
  return payload.data as T;
}

function normalizeProgress(subject: Subject): number {
  const value =
    subject.progressPct ?? subject.progress_pct ?? subject.progress ?? 0;
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"home" | "subjects" | "syllabus">("home");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [learning, setLearning] = useState<LearningHome | null>(null);
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStudentData = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const [dashboardData, learningData, syllabusData] =
        await Promise.allSettled([
          request<Dashboard>("/student/dashboard", { token: authToken }),
          request<LearningHome>("/student/learning/home", { token: authToken }),
          request<Syllabus>("/student/syllabus", { token: authToken }),
        ]);
      if (dashboardData.status === "fulfilled")
        setDashboard(dashboardData.value);
      if (learningData.status === "fulfilled") setLearning(learningData.value);
      if (syllabusData.status === "fulfilled") setSyllabus(syllabusData.value);
      const failures = [dashboardData, learningData, syllabusData].filter(
        (result) => result.status === "rejected",
      );
      if (failures.length === 3)
        throw new Error(
          "Could not load your account. Check the API connection and try again.",
        );
      if (failures.length > 0)
        setError(
          "Some student information could not be loaded yet. You can still explore the available sections.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load your student account.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync("vs_mobile_access_token")
      .then((savedToken) => {
        if (savedToken) {
          setToken(savedToken);
          void loadStudentData(savedToken);
        }
      })
      .catch(() =>
        setError("Could not restore your saved session. Please sign in again."),
      );
  }, [loadStudentData]);

  const sendCode = async () => {
    if (!/^\d{10}$/.test(phone)) {
      setError("Enter your 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/auth/send-otp", {
        method: "POST",
        body: { mobile: phone, role: "STUDENT" },
      });
      setOtpSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send the sign-in code.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{4,8}$/.test(otp)) {
      setError("Enter the code sent to your mobile.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const session = await request<{
        accessToken: string;
        refreshToken: string;
        user: User;
      }>("/auth/verify-otp", {
        method: "POST",
        body: {
          mobile: phone,
          otp,
          deviceInfo: "VidyaSetu mobile prototype",
          role: "STUDENT",
        },
      });
      if (session.user?.role !== "STUDENT")
        throw new Error("This prototype is currently for student accounts.");
      await SecureStore.setItemAsync(
        "vs_mobile_access_token",
        session.accessToken,
      );
      await SecureStore.setItemAsync(
        "vs_mobile_refresh_token",
        session.refreshToken,
      );
      setToken(session.accessToken);
      setUser(session.user);
      setOtp("");
      await loadStudentData(session.accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync("vs_mobile_access_token");
    await SecureStore.deleteItemAsync("vs_mobile_refresh_token");
    setToken(null);
    setUser(null);
    setDashboard(null);
    setLearning(null);
    setSyllabus(null);
    setPhone("");
    setOtp("");
    setOtpSent(false);
    setTab("home");
  };

  const student = dashboard?.student || dashboard?.profile;
  const name = user?.name || student?.name || "Student";
  const subjects = useMemo(
    () => learning?.subjects || dashboard?.subjects || [],
    [learning, dashboard],
  );

  if (!token)
    return (
      <SignIn
        phone={phone}
        setPhone={setPhone}
        otp={otp}
        setOtp={setOtp}
        otpSent={otpSent}
        busy={busy}
        error={error}
        clearError={() => setError("")}
        backToPhone={() => {
          setOtpSent(false);
          setOtp("");
        }}
        sendCode={() => void sendCode()}
        verifyCode={() => void verifyCode()}
      />
    );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>
            vidya<Text style={styles.brandAccent}>setu</Text>
          </Text>
          <Text style={styles.kicker}>LEARN • GROW • ACHIEVE</Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert(
              "Sign out?",
              "Your progress is saved to your account.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => void signOut(),
                },
              ],
            )
          }
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>
            {name.slice(0, 1).toUpperCase()}
          </Text>
        </Pressable>
      </View>
      {!!error && (
        <Pressable onPress={() => setError("")} style={styles.notice}>
          <Text style={styles.noticeText}>{error} ×</Text>
        </Pressable>
      )}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              if (token) void loadStudentData(token);
            }}
            tintColor={COLORS.teal}
          />
        }
      >
        {tab === "home" && (
          <>
            <View style={styles.welcome}>
              <Text style={styles.welcomeEyebrow}>YOUR LEARNING SPACE</Text>
              <Text style={styles.welcomeTitle}>
                Namaste, {name.split(" ")[0]} 👋
              </Text>
              <Text style={styles.welcomeSub}>
                {student?.class_name
                  ? `Class ${student.class_name}`
                  : learning?.learner?.className
                    ? `Class ${learning.learner.className}`
                    : "Keep learning at your own pace"}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Stat
                label="XP earned"
                value={String(dashboard?.xp ?? 0)}
                icon="✦"
              />
              <Stat
                label="Day streak"
                value={String(dashboard?.streak ?? 0)}
                icon="⚡"
              />
              <Stat
                label="Topics"
                value={String(
                  syllabus?.summary?.completedTopics ??
                    learning?.progress?.completed ??
                    0,
                )}
                icon="✓"
              />
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>
                Pick up where you left off
              </Text>
              <Pressable onPress={() => setTab("subjects")}>
                <Text style={styles.link}>See all</Text>
              </Pressable>
            </View>
            {learning?.resources?.length ? (
              learning.resources.slice(0, 3).map((resource) => (
                <View key={resource.id} style={styles.resourceCard}>
                  <View style={styles.resourceIcon}>
                    <Text style={styles.resourceIconText}>▶</Text>
                  </View>
                  <View style={styles.resourceInfo}>
                    <Text style={styles.resourceSubject}>
                      {resource.subject_name || "LEARNING"}
                    </Text>
                    <Text style={styles.resourceTitle} numberOfLines={2}>
                      {resource.title}
                    </Text>
                    <Progress value={Number(resource.progress_pct) || 0} />
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📚</Text>
                <Text style={styles.emptyTitle}>
                  Your next lesson is waiting
                </Text>
                <Text style={styles.emptyText}>
                  Explore your subjects to find something to learn.
                </Text>
                <ActionButton
                  title="Explore subjects"
                  onPress={() => setTab("subjects")}
                />
              </View>
            )}
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Syllabus progress</Text>
              <Pressable onPress={() => setTab("syllabus")}>
                <Text style={styles.link}>View syllabus</Text>
              </Pressable>
            </View>
            <View style={styles.syllabusCard}>
              <View style={styles.syllabusTop}>
                <View>
                  <Text style={styles.cardEyebrow}>
                    {syllabus?.profile?.boardCode || "MY SYLLABUS"}
                  </Text>
                  <Text style={styles.cardTitle}>
                    {syllabus?.profile?.gradeCode || student?.class_name
                      ? `Class ${syllabus?.profile?.gradeCode || student?.class_name}`
                      : "Your learning path"}
                  </Text>
                </View>
                <Text style={styles.syllabusMark}>▤</Text>
              </View>
              <Text style={styles.bodyText}>
                {syllabus
                  ? `${syllabus.summary?.completedTopics ?? 0} of ${syllabus.summary?.totalTopics ?? syllabus.topics?.length ?? 0} topics completed`
                  : "Syllabus topics will appear here when assigned to your student profile."}
              </Text>
            </View>
          </>
        )}
        {tab === "subjects" && (
          <>
            <PageHeading
              eyebrow="LEARN SOMETHING NEW"
              title="Your subjects"
              subtitle="Choose a subject and continue learning."
            />
            {subjects.length ? (
              subjects.map((subject, index) => (
                <View
                  key={
                    subject.id ||
                    subject.subjectId ||
                    subject.subject_id ||
                    subject.name ||
                    index
                  }
                  style={styles.subjectCard}
                >
                  <View
                    style={[
                      styles.subjectTile,
                      { backgroundColor: index % 2 ? "#F3EDFF" : COLORS.pale },
                    ]}
                  >
                    <Text style={styles.subjectGlyph}>
                      {["✎", "◉", "⌘", "文"][index % 4]}
                    </Text>
                  </View>
                  <View style={styles.subjectDetails}>
                    <Text style={styles.subjectName}>
                      {subject.name ||
                        subject.subject_name ||
                        subject.title ||
                        "Subject"}
                    </Text>
                    <Text style={styles.subjectMeta}>
                      {normalizeProgress(subject)}% complete
                    </Text>
                    <Progress value={normalizeProgress(subject)} />
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
              ))
            ) : (
              <EmptyState
                title="Subjects are loading"
                text="Pull down to refresh, or check back after your school has assigned your learning plan."
              />
            )}
          </>
        )}
        {tab === "syllabus" && (
          <>
            <PageHeading
              eyebrow="YOUR LEARNING PATH"
              title="My syllabus"
              subtitle={
                syllabus?.profile?.boardCode
                  ? `${syllabus.profile.boardCode} · ${syllabus.profile.academicYear || "Current year"}`
                  : "Topics matched to your class and board."
              }
            />
            {syllabus?.topics?.length ? (
              syllabus.topics.map((topic) => (
                <View key={topic.id} style={styles.topicCard}>
                  <View style={styles.topicCheck}>
                    <Text style={styles.topicCheckText}>
                      {topic.mastered || topic.learningComplete ? "✓" : "·"}
                    </Text>
                  </View>
                  <View style={styles.topicInfo}>
                    {!!topic.unit && (
                      <Text style={styles.cardEyebrow}>{topic.unit}</Text>
                    )}
                    <Text style={styles.topicChapter}>{topic.chapter}</Text>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    <Text style={styles.subjectMeta}>{topic.subject}</Text>
                  </View>
                </View>
              ))
            ) : (
              <EmptyState
                title="Syllabus not assigned yet"
                text="Once your board and class are linked to your profile, your topics will show here."
              />
            )}
          </>
        )}
      </ScrollView>
      <View style={styles.tabBar}>
        <TabButton
          label="Home"
          icon="⌂"
          active={tab === "home"}
          onPress={() => setTab("home")}
        />
        <TabButton
          label="Subjects"
          icon="▦"
          active={tab === "subjects"}
          onPress={() => setTab("subjects")}
        />
        <TabButton
          label="Syllabus"
          icon="▤"
          active={tab === "syllabus"}
          onPress={() => setTab("syllabus")}
        />
      </View>
    </SafeAreaView>
  );
}

function SignIn(props: {
  phone: string;
  setPhone: (value: string) => void;
  otp: string;
  setOtp: (value: string) => void;
  otpSent: boolean;
  busy: boolean;
  error: string;
  clearError: () => void;
  backToPhone: () => void;
  sendCode: () => void;
  verifyCode: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.signInScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.signInBrand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>व</Text>
          </View>
          <Text style={styles.brand}>
            vidya<Text style={styles.brandAccent}>setu</Text>
          </Text>
          <Text style={styles.kicker}>LEARN • GROW • ACHIEVE</Text>
        </View>
        <View style={styles.signInCard}>
          <Text style={styles.signInEyebrow}>
            WELCOME TO YOUR LEARNING SPACE
          </Text>
          <Text style={styles.signInTitle}>
            {props.otpSent ? "Enter your code" : "Learning, made yours."}
          </Text>
          <Text style={styles.signInDescription}>
            {props.otpSent
              ? `We sent a one-time code to +91 ${props.phone}.`
              : "Sign in with your student mobile number to continue your learning journey."}
          </Text>
          {props.otpSent ? (
            <>
              <Text style={styles.inputLabel}>ONE-TIME CODE</Text>
              <TextInput
                value={props.otp}
                onChangeText={(v) => {
                  props.setOtp(v.replace(/\D/g, "").slice(0, 8));
                  props.clearError();
                }}
                keyboardType="number-pad"
                placeholder="Enter the code"
                placeholderTextColor="#9AA9AE"
                style={styles.input}
              />
              <ActionButton
                title="Verify & continue"
                loading={props.busy}
                onPress={props.verifyCode}
              />
              <Pressable onPress={props.backToPhone}>
                <Text style={styles.changeNumber}>Use a different number</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
              <View style={styles.phoneField}>
                <Text style={styles.countryCode}>🇮🇳 +91</Text>
                <TextInput
                  value={props.phone}
                  onChangeText={(v) => {
                    props.setPhone(v.replace(/\D/g, "").slice(0, 10));
                    props.clearError();
                  }}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="10-digit number"
                  placeholderTextColor="#9AA9AE"
                  style={styles.phoneInput}
                />
              </View>
              <ActionButton
                title="Send sign-in code"
                loading={props.busy}
                onPress={props.sendCode}
              />
            </>
          )}
          {!!props.error && <Text style={styles.errorText}>{props.error}</Text>}
          <Text style={styles.privacyText}>
            Your account is protected. We only use your number to sign you in.
          </Text>
        </View>
        <Text style={styles.footerText}>
          A little progress every day adds up.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.max(3, Math.min(100, value))}%` },
        ]}
      />
    </View>
  );
}
function ActionButton({
  title,
  loading,
  onPress,
}: {
  title: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.actionButton,
        pressed && styles.pressed,
        loading && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <Text style={styles.actionButtonText}>{title} →</Text>
      )}
    </Pressable>
  );
}
function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text>
    </Pressable>
  );
}
function PageHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.pageHeading}>
      <Text style={styles.pageEyebrow}>{eyebrow}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyIcon}>✦</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    color: COLORS.ink,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  brandAccent: { color: COLORS.teal },
  kicker: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2.2,
    marginTop: -1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.pale,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CBEAE5",
  },
  avatarText: { color: COLORS.teal, fontSize: 17, fontWeight: "800" },
  notice: {
    backgroundColor: "#FFF4DB",
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  noticeText: { color: "#755A22", fontSize: 12, lineHeight: 18 },
  welcome: {
    backgroundColor: COLORS.ink,
    borderRadius: 24,
    padding: 22,
    marginTop: 8,
    overflow: "hidden",
  },
  welcomeEyebrow: {
    color: "#A7CED0",
    fontWeight: "800",
    letterSpacing: 1.5,
    fontSize: 9,
  },
  welcomeTitle: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: "800",
    marginTop: 10,
    letterSpacing: -0.5,
  },
  welcomeSub: { color: "#C2D4D9", fontSize: 13, marginTop: 7 },
  statRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  stat: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderColor: COLORS.line,
    borderWidth: 1,
  },
  statIcon: { color: COLORS.teal, fontSize: 15 },
  statValue: {
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 7,
  },
  statLabel: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "800" },
  link: { color: COLORS.teal, fontWeight: "700", fontSize: 12 },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderColor: COLORS.line,
    borderWidth: 1,
    padding: 20,
    alignItems: "flex-start",
  },
  emptyIcon: { color: COLORS.teal, fontSize: 23 },
  emptyTitle: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 10,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 14,
  },
  actionButton: {
    minHeight: 50,
    backgroundColor: COLORS.teal,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  actionButtonText: { color: COLORS.white, fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  resourceCard: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    flexDirection: "row",
    marginBottom: 10,
  },
  resourceIcon: {
    width: 52,
    height: 56,
    borderRadius: 13,
    backgroundColor: COLORS.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceIconText: { color: COLORS.teal, fontSize: 18 },
  resourceInfo: { flex: 1, paddingLeft: 13, justifyContent: "center" },
  resourceSubject: {
    color: COLORS.teal,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  resourceTitle: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: "700",
    marginVertical: 5,
  },
  progressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: "#E9EFF0",
    overflow: "hidden",
    marginTop: 5,
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.teal,
    borderRadius: 4,
  },
  syllabusCard: {
    backgroundColor: COLORS.blue,
    borderRadius: 19,
    padding: 18,
    marginBottom: 15,
  },
  syllabusTop: { flexDirection: "row", justifyContent: "space-between" },
  cardEyebrow: {
    color: COLORS.teal,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  cardTitle: {
    color: COLORS.ink,
    fontWeight: "800",
    fontSize: 17,
    marginTop: 5,
  },
  syllabusMark: { fontSize: 22, color: COLORS.teal },
  bodyText: { color: COLORS.muted, fontSize: 12, marginTop: 13 },
  tabBar: {
    minHeight: 66,
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderColor: COLORS.line,
    justifyContent: "space-around",
    paddingTop: 8,
    paddingBottom: 5,
  },
  tabButton: { width: "33%", alignItems: "center", justifyContent: "center" },
  tabIcon: { color: "#91A2A8", fontSize: 20, lineHeight: 24 },
  tabLabel: { color: "#91A2A8", fontWeight: "600", fontSize: 10, marginTop: 2 },
  tabActive: { color: COLORS.teal },
  pageHeading: { paddingTop: 22, paddingBottom: 19 },
  pageEyebrow: {
    color: COLORS.teal,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "900",
  },
  pageTitle: {
    color: COLORS.ink,
    fontSize: 28,
    letterSpacing: -0.6,
    fontWeight: "900",
    marginTop: 7,
  },
  pageSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  subjectCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 17,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  subjectTile: {
    width: 48,
    height: 50,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  subjectGlyph: { color: COLORS.teal, fontSize: 20, fontWeight: "800" },
  subjectDetails: { flex: 1, paddingHorizontal: 12 },
  subjectName: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  subjectMeta: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
  chevron: { color: "#9CAEB4", fontSize: 23 },
  topicCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    flexDirection: "row",
    marginBottom: 9,
  },
  topicCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.pale,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  topicCheckText: { color: COLORS.teal, fontWeight: "900", fontSize: 16 },
  topicInfo: { flex: 1 },
  topicChapter: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  topicTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  signInScroll: { flexGrow: 1, justifyContent: "center", padding: 22 },
  signInBrand: { alignItems: "center", marginBottom: 27 },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.teal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  brandIconText: { color: COLORS.white, fontWeight: "900", fontSize: 27 },
  signInCard: {
    borderRadius: 25,
    padding: 23,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  signInEyebrow: {
    color: COLORS.teal,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  signInTitle: {
    color: COLORS.ink,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 10,
  },
  signInDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 22,
  },
  inputLabel: {
    color: COLORS.ink,
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 14,
    color: COLORS.ink,
    fontSize: 17,
    marginBottom: 8,
  },
  phoneField: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 13,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  countryCode: { color: COLORS.ink, fontSize: 13, fontWeight: "700" },
  phoneInput: { flex: 1, color: COLORS.ink, fontSize: 16, paddingLeft: 11 },
  errorText: { color: COLORS.red, fontSize: 12, marginTop: 12, lineHeight: 18 },
  changeNumber: {
    color: COLORS.teal,
    textAlign: "center",
    fontWeight: "700",
    fontSize: 12,
    paddingTop: 14,
  },
  privacyText: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 19,
  },
  footerText: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 11,
    marginTop: 24,
  },
});
