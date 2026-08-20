import '@/types/api';

declare module '@/types/api' {
  interface CompetitionExam {
    registration_id?: string | null;
    attempt_status?: string | null;
    score?: string | number | null;
  }

  interface CompetitionLeaderboardRow {
    name?: string | null;
    state?: string | null;
  }

  interface DoubtAnswer {
    answerer_name?: string | null;
    created_at?: string | null;
    is_ai_answer?: boolean;
    upvoted_by_me?: boolean;
    upvote_count?: string | number | null;
  }

  interface Doubt {
    student_name?: string | null;
    view_count?: string | number | null;
    answer_count?: string | number | null;
    best_answer_id?: string | null;
  }

  interface StudentProfile {
    userId?: string;
    className?: string | null;
    section?: string | null;
    classLabel?: string | null;
    schoolName?: string | null;
    rollNumber?: string | number | null;
    academicYear?: string | null;
    xpTotal?: string | number | null;
    xpLevel?: string | number | null;
    streakCurrent?: string | number | null;
    streakBest?: string | number | null;
    badgesEarned?: string | number | null;
    language?: string | null;
    profilePhoto?: string | null;
    gradeLevel?: string | number | null;
    studentCode?: string | null;
    schoolLinkStatus?: string | null;
  }

  interface AttendanceRecord {
    remark?: string | null;
  }

  interface AttendanceSummary {
    working_days?: string | number | null;
    present_days?: string | number | null;
    absent_days?: string | number | null;
    late_days?: string | number | null;
    half_days?: string | number | null;
  }

  interface ContentSubject {
    subject_id?: string;
    color_hex?: string | null;
    total_items?: string | number | null;
    completed_items?: string | number | null;
    progress_pct?: string | number | null;
  }

  interface ContentChapter {
    subject_name?: string | null;
    subject_name_hi?: string | null;
    total_items?: string | number | null;
    video_count?: string | number | null;
    pdf_count?: string | number | null;
    quiz_count?: string | number | null;
    estimated_mins?: string | number | null;
  }

  interface ContentItem {
    duration_secs?: number | null;
    xp_reward?: string | number | null;
    quiz_score?: string | number | null;
  }

  interface StudentBadge {
    name_hi?: string | null;
    description_hi?: string | null;
    tier?: string | null;
    icon_url?: string | null;
    xp_bonus?: string | number | null;
    criteria_type?: string | null;
    criteria_value?: string | number | null;
    awarded_at?: string | null;
    earned?: boolean;
  }

  interface LeaderboardRow {
    student_id?: string;
    user_id?: string;
    profile_photo?: string | null;
    xp_total?: string | number | null;
    xp_level?: string | number | null;
    streak_current?: string | number | null;
    class_name?: string | null;
    section?: string | null;
    is_me?: boolean;
  }

  interface StudentXpEvent {
    event_type?: string | null;
    xp_amount?: string | number | null;
    reference_id?: string | null;
    reference_type?: string | null;
    description?: string | null;
    created_at?: string | null;
  }

  interface StudentRanking {
    classRank?: number | null;
    schoolRank?: number | null;
  }

  interface StudentAcademicSummary {
    average?: string | number | null;
    scoredSchoolTests?: string | number | null;
    classRank?: string | number | null;
    schoolRank?: string | number | null;
  }

  interface StudentRecentResult {
    id: string;
    title?: string | null;
    type?: string | null;
    percentage?: string | number | null;
    total_marks?: string | number | null;
    max_marks?: string | number | null;
    rank_school?: string | number | null;
    rank_overall?: string | number | null;
  }

  interface StudentDashboard {
    todayAttendance?: string | null;
    monthlyAttendance?: AttendanceSummary | null;
    recentXP?: StudentXpEvent[];
    subjectProgress?: ContentSubject[];
    ranking?: StudentRanking;
    leaderboard?: LeaderboardRow[];
    academic?: StudentAcademicSummary;
    recentResults?: StudentRecentResult[];
    unreadNotifications?: string | number | null;
  }

  interface ReportCardRow {
    score?: number;
    exam_name?: string | null;
    submitted_at?: string | null;
  }

  interface ReportCardData {
    student?: StudentProfile & {
      school_name?: string | null;
      classRank?: number | string | null;
      section?: string | null;
    };
    attendance?: {
      pct?: string | number | null;
      percentage?: string | number | null;
    };
  }
}

export {};
