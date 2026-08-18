import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export const metadata: Metadata = {
  title: 'AA2 Finance — MFI Management System',
  description: 'Enterprise Microfinance Institution Management System',
  icons: {
    icon: '/brand/aa2-microfinance.png',
    shortcut: '/brand/aa2-microfinance.png',
    apple: '/brand/aa2-microfinance.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <ToastContainer />
          <ConfirmDialog />
        </AuthProvider>
      </body>
    </html>
  )
}
