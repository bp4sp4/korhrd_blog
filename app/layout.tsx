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

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://korhrd-blog.vercel.app";

export const metadata: Metadata = {
  title: "한평생블로그",
  description: "한평생블로그",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "한평생블로그",
    description: "한평생블로그",
    url: siteUrl,
    siteName: "한평생블로그",
    images: [
      {
        url: "/share_img.png",
        width: 1200,
        height: 630,
        alt: "한평생 블매일",
      },
    ],
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "한평생블로그",
    description: "한평생블로그",
    images: ["/share_img.png"],
  },
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
