'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Input from '@/components/Input';
import Button from '@/components/Button';
import styles from './page.module.css';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccessMsg('');

        try {
            // 1. Authenticate
            const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            // 2. Fetch User Role
            const { data: userData, error: roleError } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single();

            if (roleError) {
                // Determine fallback or just error
                // Sometimes profile might not exist yet if it's a fresh auth user not in users table? 
                // Assuming users table is synced or pre-populated.
                console.error('Role fetch error:', roleError);
            }

            const userRole = userData?.role || 'operator'; // Default fallback
            const roleDisplay = userRole === 'admin' ? 'Admin' : 'Data Entry Operator';

            // 3. Success Feedback
            setSuccessMsg(`Login Successful! Welcome, ${roleDisplay}. Redirecting...`);

            // 4. Redirect
            setTimeout(() => {
                router.push('/dashboard');
            }, 1000);

        } catch (err) {
            setError(err.message);
            setLoading(false); // Only stop loading on error, otherwise keep loading state during redirect
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.title}>Welcome Back</h1>
                <p className={styles.subtitle}>Sign in to your account</p>

                {error && <div className={styles.error}>{error}</div>}
                {successMsg && <div className={styles.success} style={{ color: '#10b981', background: '#ecfdf5', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center', border: '1px solid #10b981' }}>{successMsg}</div>}

                <form onSubmit={handleLogin} className={styles.form}>
                    {/* Role Selection Removed - Auto-detected now */}

                    <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="admin@company.com"
                    />
                    <Input
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                    />

                    <Button type="submit" disabled={loading || successMsg}>
                        {loading || successMsg ? 'Signing in...' : 'Sign In'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
