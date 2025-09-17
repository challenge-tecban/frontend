import { useState, useEffect, createContext } from "react";
import api from "../config/api";
import { setAuthToken } from "../config/api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [user, setUser] = useState(null);

    async function checkAuth() {
        try {
            const { data } = await api.get('/v1/auth/validate', { withCredentials: true });
            setIsAuthenticated(!!data?.valid);
        } catch (error) {
            console.error("Error checking authentication:", error);
            setIsAuthenticated(false);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        checkAuth();
    }, []);

    // Intercept 401 responses globally and force logout + redirect to /login
    useEffect(() => {
        const interceptor = api.interceptors.response.use(
            (response) => response,
            (error) => {
                const status = error?.response?.status;
                if (status === 401) {
                    // clear state and storage
                    setIsAuthenticated(false);
                    setUser(null);
                    try {
                        // clear any stored token
                        localStorage.removeItem('token');
                    } catch (e) {}
                    // navigate to login page
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            }
        );

        return () => {
            api.interceptors.response.eject(interceptor);
        };
    }, []);

    async function handleSignin(user) {
        try {
            const { data } = await api.post('/v1/auth/signin', user, { withCredentials: true })
            // if signin returns a user/profile directly, persist it so validate() can fallback to it
            const signedUser = data?.user ?? data?.profile ?? data ?? null;
            if (signedUser && typeof signedUser === 'object') {
                setUser(signedUser);
                try { localStorage.setItem('user', JSON.stringify(signedUser)); } catch (e) {}
            }
            // After signin, refresh auth status
            await checkAuth();
            setError(null);
        } catch (error) {
            setError(error.response?.data?.message || 'An error occurred during sign-in');
        }

    }

    async function handleLogout() {
        await api.post('/v1/auth/logout', {}, { withCredentials: true });
        setIsAuthenticated(false);
        setUser(null);
        try { localStorage.removeItem('token'); } catch (e) {}
        try { localStorage.removeItem('user'); } catch (e) {}
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, error, user, handleSignin, handleLogout }}>
            {children}
        </AuthContext.Provider>
    );
};
