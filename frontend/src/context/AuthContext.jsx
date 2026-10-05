import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import * as authService from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cache-buster untuk foto profil. Path yang tersimpan di database tidak pernah
  // diubah hanya demi memaksa browser mengambil ulang gambar; yang dinaikkan
  // adalah `photoVersion` setiap kali user.foto_url berubah, sehingga foto lama
  // yang masih ada di cache browser tidak lagi dipakai setelah upload baru.
  const [photoVersion, setPhotoVersion] = useState(0);
  const photoPathRef = useRef(null);

  // Check auth status saat aplikasi pertama kali dimuat
  useEffect(() => {
    checkAuth();
  }, []);

  // Satu-satunya pintu masuk untuk menyimpan hasil /api/me ke state. Semua pemanggil
  // (login, refresh, logout) lewat sini supaya user.foto_url dan photoVersion
  // selalu berasal dari sumber data yang sama.
  const storeUser = useCallback((nextUser) => {
    setUser(nextUser);

    const nextPath = nextUser?.foto_url || null;
    if (photoPathRef.current !== nextPath) {
      photoPathRef.current = nextPath;
      setPhotoVersion((version) => version + 1);
    }

    return nextUser;
  }, []);

  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await authService.getCurrentUser();
      if (response.authenticated && response.user) {
        storeUser(response.user);
      } else {
        storeUser(null);
      }
    } catch (err) {
      storeUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [storeUser]);

  // Refresh data user tanpa mengubah isLoading, supaya halaman tidak
  // berpindah ke loading screen penuh saat profil diperbarui.
  const refreshUser = useCallback(async () => {
    try {
      const response = await authService.getCurrentUser();
      if (response.authenticated && response.user) {
        return storeUser(response.user);
      }
      storeUser(null);
      return null;
    } catch (err) {
      // Refresh gagal tidak boleh logout user secara diam-diam.
      return null;
    }
  }, [storeUser]);

  const login = useCallback(async (username, password) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login(username, password);
      storeUser(response.user);
      setIsLoading(false);
      return true;
    } catch (err) {
      setError(err.message || 'Invalid credentials');
      setIsLoading(false);
      return false;
    }
  }, [storeUser]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (err) {
      // Tetap clear state lokal meskipun API error
    } finally {
      storeUser(null);
      setError(null);
    }
  }, [storeUser]);

  // URL foto siap pakai untuk ditampilkan. Halaman /profile dan avatar di header
  // memakai nilai yang sama persis, jadi keduanya tidak mungkin berbeda dan tidak
  // perlu request terpisah.
  const photoUrl = useMemo(() => {
    const path = user?.foto_url;
    if (!path) return null;

    // '&' dipakai kalau URL asal sudah membawa query string.
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${photoVersion}`;
  }, [user?.foto_url, photoVersion]);

  const value = {
    user,
    photoUrl,
    isLoading,
    error,
    login,
    logout,
    checkAuth,
    refreshUser,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
