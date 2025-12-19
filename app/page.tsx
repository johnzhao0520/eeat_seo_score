"use client"

import { useState } from "react"
import { EvaluationForm } from "@/components/EvaluationForm"
import { EvaluationResults } from "@/components/EvaluationResults"
import { EEATResult } from "@/types/eeat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Zap, Target, TrendingUp } from "lucide-react"

export default function Home() {
  const [result, setResult] = useState<EEATResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEvaluate = async (data: {
    content: string
    title?: string
    author?: string
    url?: string
    useAI?: boolean
    useOpenAI?: boolean
  }) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error("评估失败，请稍后重试")
      }

      const result = await response.json()
      setResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "评估过程中发生错误")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                EEAT 评估系统
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Experience • Expertise • Authoritativeness • Trustworthiness
              </p>
            </div>
            <Badge variant="outline" className="text-sm px-3 py-1">
              免费版本
            </Badge>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      {!result && !loading && (
        <section className="container mx-auto px-4 py-12">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-4xl font-bold mb-4">
              智能评估您的内容质量
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              基于Google E-E-A-T标准，对您的内容进行全方位评估，提供专业的改进建议
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-sm font-medium">经验评估</div>
                <div className="text-xs text-gray-500 mt-1">
                  检查第一手经验
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-2">
                  <Zap className="w-6 h-6 text-purple-600" />
                </div>
                <div className="text-sm font-medium">专业知识</div>
                <div className="text-xs text-gray-500 mt-1">
                  评估深度和准确性
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                  <Target className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-sm font-medium">权威性</div>
                <div className="text-xs text-gray-500 mt-1">
                  验证可信度
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-2">
                  <TrendingUp className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="text-sm font-medium">可信度</div>
                <div className="text-xs text-gray-500 mt-1">
                  透明度检查
                </div>
              </div>
            </div>
          </div>

          {/* Evaluation Form */}
          <div className="max-w-4xl mx-auto">
            <EvaluationForm onEvaluate={handleEvaluate} loading={loading} />
          </div>

          {/* Features */}
          <div className="max-w-5xl mx-auto mt-16">
            <h3 className="text-2xl font-bold text-center mb-8">系统特色</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">智能评估</CardTitle>
                  <CardDescription>
                    基于Tom Winter的RFT框架，确保评估结果的一致性和准确性
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">详细分析</CardTitle>
                  <CardDescription>
                    提供四维度详细评分、证据分析和具体改进建议
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">免费使用</CardTitle>
                  <CardDescription>
                    无需注册，一键部署到Vercel，适合个人和小团队
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Loading State */}
      {loading && (
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
            <h3 className="text-xl font-semibold mb-2">正在评估您的内容...</h3>
            <p className="text-gray-600">
              正在进行E-E-A-T四维度分析，请稍候
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">评估失败</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 mb-4">{error}</p>
                <Button onClick={handleReset} variant="outline">
                  重新评估
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6 flex items-center justify-between">
              <Button onClick={handleReset} variant="outline">
                ← 重新评估
              </Button>
              <Badge variant="secondary" className="text-sm">
                评估完成
              </Badge>
            </div>
            <EvaluationResults result={result} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t bg-gray-50 mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-gray-600">
            <p className="text-sm">
              © 2024 EEAT评估系统 - 基于Google E-E-A-T标准开发
            </p>
            <p className="text-xs mt-2">
              灵感来自 Tom Winter 的SEOwind工作流程
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
