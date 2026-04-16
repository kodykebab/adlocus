import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meow | Endless Cats',
  description: 'Infinite scroll of cute cats',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased font-sans text-rose-50 flex flex-col items-center selection:bg-rose-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
