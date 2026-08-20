import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LanguageCode, UserRole, UUID } from '@vidyasetu/contracts';

export interface AuthUser {
  id?: UUID;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  mobile?: string | null;
  role?: UserRole;
  language?: LanguageCode;
  studentCode?: string | null;
  schoolLinkStatus?: string | null;
  mustChangePassword?: boolean;
  profilePhoto?: string | null;
  schoolId?: string | null;
  teacherId?: string | null;
  classId?: string | null;
  className?: string | number | null;
  gradeLevel?: string | number | null;
  rollNumber?: string | number | null;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  logout: () => void;
}

type PersistedAuthState = Pick<AuthState, 'user' | 'accessToken' | 'refreshToken' | 'isLoggedIn'>;

const useAuthStore = create<AuthState>()(
  persist<AuthState, [], [], PersistedAuthState>(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,

      setAuth: (user, accessToken, refreshToken) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('vs_access_token', accessToken);
          localStorage.setItem('vs_refresh_token', refreshToken);
        }
        set({ user, accessToken, refreshToken, isLoggedIn: true });
      },

      updateUser: (updates) =>
        set((state) => ({ user: { ...(state.user || {}), ...updates } })),

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('vs_access_token');
          localStorage.removeItem('vs_refresh_token');
        }
        set({ user: null, accessToken: null, refreshToken: null, isLoggedIn: false });
      },
    }),
    {
      name: 'vidyasetu-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isLoggedIn: state.isLoggedIn,
      }),
    },
  ),
);

export default useAuthStore;
