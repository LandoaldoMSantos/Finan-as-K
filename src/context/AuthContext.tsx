import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { api, setAuthToken } from '../lib/api.ts';
import { User as DbUser } from '../types.ts';

interface AuthContextType {
  user: FirebaseUser | null;
  dbUser: DbUser | null;
  token: string | null;
  googleToken: string | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  connectGoogleDrive: () => Promise<string | null>;
  logout: () => Promise<void>;
  refreshUserSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUserSync = async () => {
    if (!auth.currentUser) return;
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      setToken(idToken);
      setAuthToken(idToken);
      const res = await api.getCurrentUser();
      setDbUser(res.dbUser);
    } catch (e) {
      console.error('Error syncing user with database:', e);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          // Retrieve ID Token from Firebase User
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
          setAuthToken(idToken);
          
          // Sync with Postgres database
          const res = await api.getCurrentUser();
          setDbUser(res.dbUser);
        } catch (e) {
          console.error('Error syncing user with database on auth change:', e);
        }
      } else {
        setUser(null);
        setDbUser(null);
        setToken(null);
        setGoogleToken(null);
        setAuthToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoading(false);
      throw error;
    }
  };

  const connectGoogleDrive = async () => {
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        return credential.accessToken;
      }
      return null;
    } catch (error) {
      console.error('Error connecting Google Drive:', error);
      throw error;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      dbUser, 
      token, 
      googleToken, 
      loading, 
      loginWithGoogle, 
      connectGoogleDrive, 
      logout, 
      refreshUserSync 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
