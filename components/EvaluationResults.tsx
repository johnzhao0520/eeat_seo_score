"use client"

import { useState } from "react"
import { EEATResult } from "@/types/eeat"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScoreCircle } from "./ScoreCircle"
import { EEATScoreCard } from "./EEATScoreCard"
import { getScoreLevel } from "@/lib/utils"
import {
  UserCheck,
  GraduationCap,
  Award,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Target,
  Download,
} from "lucide-react"

interface EvaluationResultsProps {
  result: EEATResult
}

export function EvaluationResults({ result }: EvaluationResultsProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const overallLevel = getScoreLevel(result.scores.overall)

  const handleExport = () => {
    const dataStr = JSON.stringify(result, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `eeat-evaluation-${Date.now()}.json`
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* 总体评分卡片 */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">EEAT 评估结果</CardTitle>
              <CardDescription className="mt-2">
                {result.articleContext.type} • {result.articleContext.niche} •{" "}
                {result.articleContext.purpose}
              </CardDescription>
            </div>
            <Button onClick={handleExport} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              导出报告
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <ScoreCircle score={result.scores.overall} size={140} strokeWidth={10} />
            <div className="flex-1 space-y-3">
              <div>
                <div className="text-sm text-gray-500">总体评分</div>
                <div className={`text-2xl font-bold ${overallLevel.color}`}>
                  {result.scores.overall.toFixed(1)}/10 - {overallLevel.level}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {overallLevel.description}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">内容长度:</span>
                  <span className="font-medium">{result.articleContext.contentLength} 字符</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">预计阅读:</span>
                  <span className="font-medium">{result.articleContext.readingTime} 分钟</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">目标受众:</span>
                  <span className="font-medium">{result.articleContext.targetAudience}</span>
                </div>
                {result.articleContext.type && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">文章类型:</span>
                    <Badge variant="secondary">{result.articleContext.type}</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 详细评分标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">四维评分</TabsTrigger>
          <TabsTrigger value="analysis">深度分析</TabsTrigger>
          <TabsTrigger value="suggestions">改进建议</TabsTrigger>
          <TabsTrigger value="summary">总结</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EEATScoreCard
              title="经验 (Experience)"
              data={result.scores.experience}
              icon={<UserCheck className="w-4 h-4" />}
            />
            <EEATScoreCard
              title="专业知识 (Expertise)"
              data={result.scores.expertise}
              icon={<GraduationCap className="w-4 h-4" />}
            />
            <EEATScoreCard
              title="权威性 (Authoritativeness)"
              data={result.scores.authoritativeness}
              icon={<Award className="w-4 h-4" />}
            />
            <EEATScoreCard
              title="可信度 (Trustworthiness)"
              data={result.scores.trustworthiness}
              icon={<ShieldCheck className="w-4 h-4" />}
            />
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-green-600">
                  <TrendingUp className="w-5 h-5" />
                  优势
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.analysis.strengths.map((strength, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-green-500 mt-1">•</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-red-600">
                  <TrendingDown className="w-5 h-5" />
                  弱点
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.analysis.weaknesses.map((weakness, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-red-500 mt-1">•</span>
                      {weakness}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-blue-600">
                  <Target className="w-5 h-5" />
                  机会
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.analysis.opportunities.map((opportunity, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-blue-500 mt-1">•</span>
                      {opportunity}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4 mt-6">
          <div className="space-y-4">
            {result.suggestions.map((suggestion, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{suggestion.category}</CardTitle>
                    <Badge
                      variant={
                        suggestion.priority === "high"
                          ? "destructive"
                          : suggestion.priority === "medium"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {suggestion.priority === "high" && "高优先级"}
                      {suggestion.priority === "medium" && "中优先级"}
                      {suggestion.priority === "low" && "低优先级"}
                    </Badge>
                  </div>
                  <CardDescription>{suggestion.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {suggestion.actionItems.map((item, j) => (
                      <li key={j} className="text-sm flex items-start gap-2">
                        <span className="text-blue-500 mt-1">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>评估总结</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-line">{result.summary}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
