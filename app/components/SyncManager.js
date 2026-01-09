'use client';

import { useEffect, useState } from 'react';
import { getOfflineVouchers, deleteOfflineVoucher } from '@/lib/syncManager';
import { createVoucher } from '@/app/actions';

export default function SyncManager() {
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    const checkPending = async () => {
        const pending = await getOfflineVouchers();
        setPendingCount(pending.length);
        if (navigator.onLine && pending.length > 0 && !isSyncing) {
            syncNow(pending);
        }
    };

    const syncNow = async (pending) => {
        setIsSyncing(true);
        console.log(`[Sync] Starting sync for ${pending.length} vouchers...`);

        for (const v of pending) {
            const formData = new FormData();
            formData.append('company_id', v.companyId);
            formData.append('voucher_type', v.type);
            formData.append('date', v.date);
            formData.append('narration', v.narration + " (Synced Offline)");

            try {
                const result = await createVoucher(formData, v.entries);
                if (result.success) {
                    await deleteOfflineVoucher(v.id);
                    console.log(`[Sync] Voutcher SYNCED: ${v.id}`);
                } else {
                    console.error(`[Sync] Failed to sync voucher ${v.id}:`, result.error);
                }
            } catch (err) {
                console.error(`[Sync] Fatal error syncing voucher ${v.id}:`, err);
            }
        }

        setIsSyncing(false);
        const remaining = await getOfflineVouchers();
        setPendingCount(remaining.length);
    };

    useEffect(() => {
        // Initial check
        checkPending();

        // Listen for online status
        const handleOnline = () => {
            console.log("[Sync] Device back online! Triggering sync...");
            checkPending();
        };

        window.addEventListener('online', handleOnline);
        const interval = setInterval(checkPending, 30000); // Check every 30s as fallback

        return () => {
            window.removeEventListener('online', handleOnline);
            clearInterval(interval);
        };
    }, []);

    if (pendingCount === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: isSyncing ? '#3b82f6' : '#f59e0b',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: '600',
            animation: 'slideIn 0.3s ease-out'
        }}>
            <style>{`
                @keyframes slideIn {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
            <span>{isSyncing ? '🔄 Syncing Data...' : `⚠️ ${pendingCount} Vouchers Pending Sync`}</span>
        </div>
    );
}
