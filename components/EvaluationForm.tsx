"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, FileText, Globe, Upload, Sparkles, Info } from "lucide-react"

interface EvaluationFormProps {
  onEvaluate: (data: {
    content: string;
    title?: string;
    author?: string;
    url?: string;
    useAI?: boolean;
  }) => void
  loading?: boolean
}

export function EvaluationForm({ onEvaluate, loading = false }: EvaluationFormProps) {
  const [activeTab, setActiveTab] = useState("text")
  const [content, setContent] = useState("")
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [url, setUrl] = useState("")
  const [useAI, setUseAI] = useState(true) // 默认启用AI
  const [isFetching, setIsFetching] = useState(false)

  const handleSubmit = () => {
    onEvaluate({
      content,
      title: title || undefined,
      author: author || undefined,
      url: url || undefined,
      useAI
    })
  }

  const isValid = content.trim().length > 50

  const handleFetchUrl = async () => {
    if (!url.trim()) {
      alert("请输入有效的URL")
      return
    }

    setIsFetching(true)
    try {
      const response = await fetch('/api/fetch-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '抓取失败')
      }

      if (data.success && data.content) {
        setContent(data.content)
        setActiveTab("text") // 切换到文本输入标签页

        // 尝试从内容中提取标题
        const titleMatch = data.content.match(/^#\s+(.+)$/m)
        if (titleMatch && !title) {
          setTitle(titleMatch[1].trim())
        }
      } else {
        throw new Error('未获取到有效内容')
      }
    } catch (error) {
      console.error('抓取失败:', error)
      alert(`抓取失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          EEAT 内容评估
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="text" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              直接输入
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              从URL获取
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">文章标题（可选）</label>
              <Input
                placeholder="输入文章标题..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">作者（可选）</label>
              <Input
                placeholder="输入作者姓名..."
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                文章内容 <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="请粘贴您的文章内容（至少50字符）..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
              <div className="text-xs text-gray-500">
                {content.length} 字符
              </div>
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">文章URL</label>
              <Input
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isFetching}
              />
              <Button
                onClick={handleFetchUrl}
                disabled={!url.trim() || isFetching}
                variant="outline"
                className="w-full"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    抓取中...
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    抓取文章内容
                  </>
                )}
              </Button>
              <div className="text-xs text-gray-500">
                输入文章链接后点击抓取按钮，系统将自动提取文章内容
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* AI选项 */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-gray-900">AI智能评估</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">AI驱动</span>
              </div>

              {/* AI主开关 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">启用智能评估</span>
                  <div className="relative group inline-block">
                    <Info className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-10">
                      <div className="font-semibold mb-1">AI评估优势：</div>
                      <ul className="space-y-1">
                        <li>• 深度内容理解与分析</li>
                        <li>• 专业评估建议</li>
                        <li>• 高效准确的评估</li>
                        <li>• 详细的EEAT四维评分</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUseAI(!useAI)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    useAI ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useAI ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {useAI && (
                <div className="mt-3 text-xs text-green-600 bg-green-50 p-2 rounded">
                  ✨ 使用AI模型提供专业的EEAT评估
                </div>
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              评估中...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              开始评估
            </>
          )}
        </Button>

        {!isValid && content.length > 0 && (
          <div className="text-xs text-red-500">
            内容至少需要50字符才能进行评估
          </div>
        )}
      </CardContent>
    </Card>
  )
}
