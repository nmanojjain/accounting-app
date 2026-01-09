import { Suspense } from 'react';
import DashboardLayoutClient from './DashboardLayoutClient';

export default function DashboardLayout({ children }) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <DashboardLayoutClient>
                {children}
            </DashboardLayoutClient>
        </Suspense>
    );
}
