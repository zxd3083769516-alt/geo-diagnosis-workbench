import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GEO 运营系统',
  description: '从品牌事实、真实AI测试到来源审计、优化动作、实验复测与月度跟踪。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
