import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from '@/components/AuthProvider';
import "./globals.css";

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: "MartGenie - Smart Home Furnishing",
  description: "Let AI search, filter, negotiate prices, and recommend the best home furnishing packages for you",
  keywords: ["AI home", "smart furnishing", "home ecommerce", "AI agent", "furniture shopping"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
