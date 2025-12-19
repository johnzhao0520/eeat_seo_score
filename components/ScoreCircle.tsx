"use client"

import { getScoreLevel } from "@/lib/utils"

interface ScoreCircleProps {
  score: number
  size?: number
  strokeWidth?: number
  label?: string
}

export function ScoreCircle({ score, size = 120, strokeWidth = 8, label }: ScoreCircleProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (score / 10) * circumference
  const levelInfo = getScoreLevel(score)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={
            score >= 8
              ? "text-green-500"
              : score >= 6
              ? "text-blue-500"
              : score >= 4
              ? "text-yellow-500"
              : "text-red-500"
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{score.toFixed(1)}</span>
        {label && <span className="text-xs text-gray-500 mt-1">{label}</span>}
      </div>
    </div>
  )
}
