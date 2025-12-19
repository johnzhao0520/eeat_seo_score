import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "EEAT评估系统 - 内容质量智能评估工具",
  description:
    "基于Experience、Expertise、Authoritativeness、Trustworthiness的智能内容评估系统，帮助您创建高质量、符合SEO标准的内容。",
  keywords: "EEAT, 内容评估, SEO, 质量评估, 智能评估",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
