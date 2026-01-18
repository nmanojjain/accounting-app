'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetAndImportData } from '@/app/actions';

export default function MigrationButton({ companyId, ledgers, rowCount }) {
    const [status, setStatus] = useState('idle'); // idle, running, success, error
    const [message, setMessage] = useState('');
    const router = useRouter();

    const [confirming, setConfirming] = useState(false);

    const handleRun = async () => {
        setConfirming(true);
    };

    const confirmAndExecute = async () => {
        setStatus('running');
        setMessage('REVERTING to Opening Balances Only (Wiping Vouchers)...');
        setConfirming(false);

        try {
            console.log('Calling resetAndImportData...');
            const result = await resetAndImportData(companyId, ledgers);

            if (result.success) {
                setStatus('success');
                setMessage(`Success! Cleaned up and imported ${result.count} ledgers.`);
                setTimeout(() => {
                    router.push(`/dashboard/c/${companyId}`);
                }, 2000);
            } else {
                setStatus('error');
                setMessage(result.error);
            }
        } catch (e) {
            console.error(e);
            setStatus('error');
            setMessage(e.message);
        }
    };

    return (
        <div style={{ padding: '2rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white' }}>
            <h2 style={{ marginBottom: '1rem', color: '#1e293b' }}>Confirm Wipe & Reset</h2>
            <p style={{ marginBottom: '1rem' }}>
                <strong>Target Company ID:</strong> {companyId}<br />
                <strong>CSV Rows to Import:</strong> {rowCount}
            </p>

            {status === 'idle' && !confirming && (
                <button
                    onClick={handleRun}
                    style={{
                        padding: '0.75rem 1.5rem',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    WIPE VOUCHERS & RESET
                </button>
            )}

            {confirming && (
                <div style={{ background: '#fff1f2', padding: '1rem', borderRadius: '6px', border: '1px solid #fda4af' }}>
                    <p style={{ color: '#991b1b', fontWeight: 'bold', marginBottom: '1rem' }}>
                        ⚠️ DANGER: This will PERMANENTLY DELETE all vouchers.
                        <br />We will start fresh with only Opening Balances from today.
                        <br />Are you absolutely sure?
                    </p>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={confirmAndExecute}
                            style={{ padding: '0.5rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            YES, RESET EVERYTHING
                        </button>
                        <button
                            onClick={() => setConfirming(false)}
                            style={{ padding: '0.5rem 1rem', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {status === 'running' && <div style={{ color: '#2563eb', fontWeight: 'bold' }}>⏳ Processing... Please wait.</div>}

            {status === 'success' && (
                <div style={{ color: '#16a34a', fontWeight: 'bold', marginTop: '1rem' }}>
                    ✅ {message}
                </div>
            )}

            {status === 'error' && (
                <div style={{ color: '#dc2626', fontWeight: 'bold', marginTop: '1rem' }}>
                    ❌ Error: {message}
                </div>
            )}
        </div>
    );
}
