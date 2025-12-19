"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScoreCircle } from "./ScoreCircle"
import { ScoreDetails } from "@/types/eeat"
import { getScoreLevel } from "@/lib/utils"
import { CheckCircle, XCircle, AlertCircle } from "lucide-react"

interface EEATScoreCardProps {
  title: string
  data: ScoreDetails
  icon: React.ReactNode
}

export function EEATScoreCard({ title, data, icon }: EEATScoreCardProps) {
  const levelInfo = getScoreLevel(data.score)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <Badge variant={data.score >= 7 ? "default" : data.score >= 5 ? "secondary" : "destructive"}>
          {data.score.toFixed(1)}/10
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <ScoreCircle score={data.score} size={80} strokeWidth={6} />
          <div className="flex-1 space-y-2">
            <div className={`text-xs font-medium ${levelInfo.color}`}>
              {levelInfo.level} - {levelInfo.description}
            </div>

            {data.strengths.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-xs text-green-600 font-medium mb-1">
                  <CheckCircle className="w-3 h-3" />
                  优势
                </div>
                <ul className="text-xs text-gray-600 space-y-1">
                  {data.strengths.slice(0, 2).map((strength, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-green-500 mt-0.5">•</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.issues.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-xs text-red-600 font-medium mb-1">
                  <XCircle className="w-3 h-3" />
                  问题
                </div>
                <ul className="text-xs text-gray-600 space-y-1">
                  {data.issues.slice(0, 2).map((issue, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-red-500 mt-0.5">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.suggestions.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mb-1">
                  <AlertCircle className="w-3 h-3" />
                  建议
                </div>
                <ul className="text-xs text-gray-600 space-y-1">
                  {data.suggestions.slice(0, 2).map((suggestion, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
