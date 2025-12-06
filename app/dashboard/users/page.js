'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { createOperator, syncUsers } from '@/app/actions';
import styles from './page.module.css';

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const router = useRouter();

    useEffect(() => {
        checkAccess();
    }, []);

    const checkAccess = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
            if (userData?.role !== 'admin') {
                router.push('/dashboard');
                return;
            }
        }
        fetchUsers();
    };

    const fetchUsers = async () => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'operator')
            .order('created_at', { ascending: false });

        if (data) setUsers(data);
        setLoading(false);
    };

    const handleSubmit = async (formData) => {
        const result = await createOperator(formData);
        if (result.success) {
            setShowForm(false);
            fetchUsers();
            if (result.message) alert(result.message);
        } else {
            alert(result.error || 'Failed to create user');
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        const result = await syncUsers();
        if (result.success) {
            alert(`Synced ${result.count} users.`);
            fetchUsers();
        } else {
            alert('Sync failed: ' + result.error);
        }
        setSyncing(false);
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <div className={styles.header}>
                <h1 className={styles.title}>Operators</h1>
                <div className={styles.actions}>
                    <Button onClick={handleSync} disabled={syncing} className={styles.syncBtn}>
                        {syncing ? 'Syncing...' : 'Sync Users'}
                    </Button>
                    <Button onClick={() => setShowForm(!showForm)}>
                        {showForm ? 'Cancel' : 'New Operator'}
                    </Button>
                </div>
            </div>

            {showForm && (
                <div className={styles.formCard}>
                    <form action={handleSubmit} className={styles.form}>
                        <Input name="email" label="Email" type="email" required placeholder="operator@company.com" />
                        <Input name="password" label="Password" type="password" required placeholder="••••••••" />
                        <Input name="passkey" label="Passkey" required placeholder="Secret Code" />
                        <Button type="submit">Create Operator</Button>
                    </form>
                </div>
            )}

            <div className={styles.list}>
                {users.length === 0 ? (
                    <p>No operators found.</p>
                ) : (
                    users.map((user) => (
                        <div key={user.id} className={styles.userCard}>
                            <h3>{user.email}</h3>
                            <p>Passkey: {user.passkey}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
