import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SecondChance — Proxy & Number Management",
  description: "Internal dashboard for managing proxies and phone numbers across Vinted markets.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side: read the current user to pass as initial state to providers
  let initialUser = null;
  try {
    initialUser = await getCurrentUser();
  } catch {
    // Not authenticated — that's fine
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers initialUser={initialUser}>{children}</Providers>
      </body>
    </html>
  );
}
