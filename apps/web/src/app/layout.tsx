import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import { Providers } from './providers';
import Script from 'next/script';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'Dine&Stay OS', template: '%s | Dine&Stay OS' },
  description: 'Restaurant POS & Hotel Management SaaS',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'D&S OS' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f59e0b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 antialiased transition-colors duration-200">
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
        <Providers>
          {children}
          <Toaster
            position="top-center"
            reverseOrder={false}
            gutter={10}
            containerStyle={{
              top: 20,
            }}
            toastOptions={{
              duration: 2500,
              style: {
                maxWidth: '420px',
                padding: '12px 20px',
                borderRadius: '16px',
                fontSize: '14px',
                fontWeight: 500,
                boxShadow: '0 20px 60px -15px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)',
                backdropFilter: 'blur(12px)',
              },
              className: 'bg-white/95 text-slate-900 border border-slate-200/80 dark:bg-slate-800/95 dark:text-slate-100 dark:border-slate-700/80',
              success: {
                duration: 2000,
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#ffffff',
                },
                style: {
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  color: '#065f46',
                },
                className: 'dark:!bg-emerald-900/30 dark:!border-emerald-500/30 dark:!text-emerald-200',
              },
              error: {
                duration: 4000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#ffffff',
                },
                style: {
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#991b1b',
                },
                className: 'dark:!bg-red-900/30 dark:!border-red-500/30 dark:!text-red-200',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}