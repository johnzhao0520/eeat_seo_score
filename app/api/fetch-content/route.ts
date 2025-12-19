import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"

interface CrawlResponse {
  url: string;
  filter: string;
  query: string | null;
  cache: string;
  markdown: string;
  success: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: "请提供有效的URL" },
        { status: 400 }
      );
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "请提供有效的URL格式" },
        { status: 400 }
      );
    }

    logger.info("开始抓取内容", { url });

    // 调用爬虫服务
    const crawlResponse = await fetch('https://crawl4ai.steelprogroup.com/md', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        f: 'fit',
        q: null,
        c: '0'
      })
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      logger.error("爬虫服务调用失败", {
        status: crawlResponse.status,
        error: errorText
      });
      return NextResponse.json(
        { error: "内容抓取失败，请稍后重试" },
        { status: 500 }
      );
    }

    const crawlData: CrawlResponse = await crawlResponse.json();

    if (!crawlData.success || !crawlData.markdown) {
      logger.error("爬虫返回内容无效", { crawlData });
      return NextResponse.json(
        { error: "无法获取有效内容" },
        { status: 500 }
      );
    }

    // 清理和预处理markdown内容
    const cleanedContent = cleanMarkdownContent(crawlData.markdown);

    logger.info("内容抓取成功", {
      url,
      originalLength: crawlData.markdown.length,
      cleanedLength: cleanedContent.length
    });

    return NextResponse.json({
      url: crawlData.url,
      content: cleanedContent,
      success: true
    });

  } catch (error) {
    logger.error("抓取内容时发生错误", {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: "抓取内容时发生错误，请稍后重试" },
      { status: 500 }
    );
  }
}

function cleanMarkdownContent(markdown: string): string {
  // 移除导航菜单等干扰内容
  let cleaned = markdown;

  // 移除导航链接和菜单
  cleaned = cleaned.replace(/\*\s*\[.*?\]\(.*?\)/g, '');
  cleaned = cleaned.replace(/^\s*\[.*?\]\(.*?\)\s*$/gm, '');

  // 移除重复的标题和导航
  cleaned = cleaned.replace(/(\n\s*){3,}/g, '\n\n');

  // 移除过短的段落（可能是导航元素）
  const lines = cleaned.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    // 保留标题、段落、列表等有意义的行
    if (trimmed.startsWith('#') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('-') ||
        trimmed.startsWith('>') ||
        trimmed.length > 30) {
      return true;
    }
    // 移除纯链接行或过短的文本行
    return false;
  });

  cleaned = filteredLines.join('\n');

  // 清理多余的空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}