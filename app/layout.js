import './globals.css'

export const metadata = {
    title: 'Dual Entry Accounting',
    description: 'Secure, Cloud-Based Financial Management',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Accounting',
    },
}

export const viewport = {
    themeColor: '#001e80',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>{children}</body>
        </html>
    )
}
