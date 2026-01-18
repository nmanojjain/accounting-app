'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { createOperator, updateOperator, syncUsers } from '@/app/actions';
import styles from './page.module.css';

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
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
            // .eq('role', 'operator') // Show all users
            .order('created_at', { ascending: false });

        if (data) setUsers(data);
        setLoading(false);
    };

    const handleSubmit = async (formData) => {
        if (editingUser) {
            formData.append('id', editingUser.id);
            const result = await updateOperator(formData);
            if (result.success) {
                setShowForm(false);
                setEditingUser(null);
                fetchUsers();
                if (result.message) alert(result.message);
            } else {
                alert(result.error);
            }
        } else {
            const result = await createOperator(formData);
            if (result.success) {
                setShowForm(false);
                fetchUsers();
                if (result.message) alert(result.message);
            } else {
                alert(result.error || 'Failed to create user');
            }
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

    const handleEdit = (user) => {
        setEditingUser(user);
        setShowForm(true);
    };

    const cancelForm = () => {
        setShowForm(false);
        setEditingUser(null);
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
                    <Button onClick={() => { setShowForm(!showForm); setEditingUser(null); }}>
                        {showForm ? 'Cancel' : 'New Operator'}
                    </Button>
                </div>
            </div>

            {showForm && (
                <div className={styles.formCard}>
                    <form action={handleSubmit} className={styles.form}>
                        <h3>{editingUser ? 'Edit User' : 'New User'}</h3>
                        <Input
                            name="email"
                            label="Email"
                            type="email"
                            required
                            defaultValue={editingUser?.email}
                            placeholder="user@company.com"
                        />

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Role</label>
                            <select
                                name="role"
                                defaultValue={editingUser?.role || 'operator'}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem'
                                }}
                            >
                                <option value="operator">Operator (Restricted)</option>
                                <option value="admin">Admin (Full Access)</option>
                            </select>
                        </div>

                        <Input
                            name="password"
                            label={`Password ${editingUser ? '(Leave blank to keep unchanged)' : ''}`}
                            type="password"
                            required={!editingUser}
                            placeholder="••••••••"
                        />
                        <Input
                            name="passkey"
                            label="Passkey"
                            required
                            defaultValue={editingUser?.passkey}
                            placeholder="Secret Code"
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <Button type="submit">{editingUser ? 'Update User' : 'Create User'}</Button>
                            <Button type="button" variant="secondary" onClick={cancelForm}>Cancel</Button>
                        </div>
                    </form>
                </div>
            )}

            <div className={styles.list}>
                {users.length === 0 ? (
                    <p>No users found.</p>
                ) : (
                    users.map((user) => (
                        <div key={user.id} className={styles.userCard} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#1e293b' }}>{user.email} <span style={{ fontSize: '0.8rem', background: user.role === 'admin' ? '#dbeafe' : '#f3f4f6', color: user.role === 'admin' ? '#1e40af' : '#374151', padding: '2px 6px', borderRadius: '4px', marginLeft: '0.5rem' }}>{user.role}</span></h3>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Passkey: <strong>{user.passkey}</strong></p>
                            </div>
                            <Button variant="secondary" onClick={() => handleEdit(user)}>Edit</Button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
