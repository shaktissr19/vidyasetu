import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user:          null,
      accessToken:   null,
      refreshToken:  null,
      isLoggedIn:    false,

      setAuth: (user, accessToken, refreshToken) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('vs_access_token',  accessToken);
          localStorage.setItem('vs_refresh_token', refreshToken);
        }
        set({ user, accessToken, refreshToken, isLoggedIn: true });
      },

      updateUser: (updates) =>
        set(state => ({ user: { ...state.user, ...updates } })),

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('vs_access_token');
          localStorage.removeItem('vs_refresh_token');
        }
        set({ user: null, accessToken: null, refreshToken: null, isLoggedIn: false });
      },
    }),
    {
      name:    'vidyasetu-auth',
      partialize: (state) => ({
        user:         state.user,
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
        isLoggedIn:   state.isLoggedIn,
      }),
    }
  )
);

export default useAuthStore;
