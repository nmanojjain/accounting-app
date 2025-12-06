import './globals.css'

export const metadata = {
    title: 'Dual Entry Accounting',
    description: 'Secure, Cloud-Based Financial Management',
}

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
