import { useState, useEffect, useCallback } from 'react';

const SESSION_STORAGE_KEY = 'secureWipeSession';
const SESSION_ID_KEY = 'secureWipeSessionId';

export function useSessionManager() {
  const [sessionId, setSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);

  // Initialize session from storage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSessionId = localStorage.getItem(SESSION_ID_KEY);
      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      
      if (savedSessionId) {
        setSessionId(savedSessionId);
      }
      
      if (savedSession) {
        try {
          setSessionData(JSON.parse(savedSession));
        } catch (e) {
          console.error('Failed to parse saved session:', e);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    }
  }, []);

  // Create a new session
  const createNewSession = useCallback((initialData = {}) => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: newSessionId,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      ...initialData
    };

    setSessionId(newSessionId);
    setSessionData(session);

    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_ID_KEY, newSessionId);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }

    return newSessionId;
  }, []);

  // Update session data
  const updateSession = useCallback((updates) => {
    setSessionData(prev => {
      const newData = { 
        ...prev, 
        ...updates, 
        lastAccessed: new Date().toISOString(),
        id: prev?.id || updates.id || sessionId 
      };
      
      if (typeof window !== 'undefined') {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newData));
      }
      
      return newData;
    });
  }, [sessionId]);

  // Clear session
  const clearSession = useCallback(() => {
    setSessionId(null);
    setSessionData(null);
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_ID_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  // Get current session info
  const getSessionInfo = useCallback(() => ({
    id: sessionId,
    data: sessionData,
    exists: !!sessionId
  }), [sessionId, sessionData]);

  return {
    sessionId,
    sessionData,
    createNewSession,
    updateSession,
    clearSession,
    getSessionInfo
  };
}