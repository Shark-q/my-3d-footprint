import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import { I18nProvider } from '@/i18n/I18nProvider';
import "./globals.css";

const firaCode = Fira_Code({ 
  subsets: ["latin"],
  variable: '--font-fira-code',
  display: 'swap',
});

const firaSans = Fira_Sans({ 
  subsets: ["latin"],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-fira-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "3D Footprint - Your Immersive Journey Map",
  description: "Visualize your travel history on an interactive 3D globe. Upload photos with GPS data and create beautiful travel stories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${firaCode.variable} ${firaSans.variable} font-sans`}>
          <I18nProvider>
            {children}
          </I18nProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
