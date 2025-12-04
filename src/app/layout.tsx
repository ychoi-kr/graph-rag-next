import type { Metadata } from 'next';
import './globals.css';
import { AmplifyProvider } from './amplify-provider';

export const metadata: Metadata = {
  title: 'Graph RAG',
  description: 'Next.js + Amplify Gen 2',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AmplifyProvider>
          {children}
        </AmplifyProvider>
      </body>
    </html>
  );
}
