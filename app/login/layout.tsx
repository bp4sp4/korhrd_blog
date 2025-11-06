import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인 - 한평생블로그",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 로그인 페이지는 레이아웃 없이 표시
  return <>{children}</>;
}

