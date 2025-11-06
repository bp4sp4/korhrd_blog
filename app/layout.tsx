import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutConditional from "../components/Layout/LayoutConditional";
import LayoutWrapper from "../components/Layout/LayoutWrapper";
import Layout from "../components/Layout/Layout";
import { SidebarProvider } from "../contexts/SidebarContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "한평생블로그",
  description: "한평생블로그",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SidebarProvider>
          <LayoutConditional>
            <LayoutWrapper layoutComponent={<Layout>{children}</Layout>}>
        {children}
            </LayoutWrapper>
          </LayoutConditional>
        </SidebarProvider>
      </body>
    </html>
  );
}
