# EEAT评估系统

基于Google E-E-A-T（Experience、Expertise、Authoritativeness、Trustworthiness）标准的智能内容评估系统。

![EEAT评估系统](https://img.shields.io/badge/EEAT-Evaluation-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## 📋 功能特性

### ✨ 核心功能

- **AI智能评估**：支持智谱AI和OpenAI双模型，提供专业的EEAT评估
- **四维度评分**：Experience、Expertise、Authoritativeness、Trustworthiness 1-10分评分
- **详细分析**：提供证据、问题、优势和改进建议
- **URL内容抓取**：支持从网页URL自动抓取文章内容
- **上下文感知**：根据文章类型和利基市场调整评估标准
- **批量评估**：支持同时评估多篇文章
- **报告导出**：导出JSON格式的详细评估报告
- **免费部署**：一键部署到Vercel，无需服务器成本

### 🎯 适用场景

- 内容创作者评估文章质量
- SEO专家优化内容策略
- 营销团队批量审核内容
- 企业内容质量管控
- 学习E-E-A-T评估方法

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 或 yarn

### 本地运行

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd eeat-evaluation-system
   ```

2. **安装依赖**
   ```bash
   npm install
   # 或
   yarn install
   ```

3. **配置环境变量（推荐）**
   ```bash
   cp .env.example .env.local
   ```
   编辑 `.env.local` 文件，添加API Keys：
   - `ZHIPU_API_KEY`：智谱AI API Key（推荐，经济实惠）
   - `OPENAI_API_KEY`：OpenAI API Key（备选，价格较高）

4. **启动开发服务器**
   ```bash
   npm run dev
   # 或
   yarn dev
   ```

5. **访问应用**
   打开 [http://localhost:3000](http://localhost:3000)

### Vercel部署（推荐）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/johnzhao0520/eeat_seo_score)

1. 点击上方按钮，或在Vercel控制台点击"New Project"
2. 导入Git仓库
3. 配置环境变量（推荐）：
   - `ZHIPU_API_KEY`：智谱AI API Key（推荐，更经济实惠）
   - `OPENAI_API_KEY`：OpenAI API Key（备选）
4. 点击"Deploy"

部署完成后，您将获得一个免费的在线EEAT评估工具！

## 📖 使用指南

### 单篇文章评估

1. 在首页输入文章内容（至少50字符），或通过"从URL获取"标签页抓取网页内容
2. 可选择添加标题和作者
3. 开启"AI智能评估"开关以获得更准确的评估（需要配置API Key）
4. 点击"开始评估"
5. 查看四维度详细评分和分析报告

### 批量评估

通过API调用进行批量评估：

```bash
curl -X POST http://localhost:3000/api/batch-evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [
      {
        "content": "文章内容1...",
        "title": "标题1",
        "author": "作者1"
      },
      {
        "content": "文章内容2...",
        "title": "标题2"
      }
    ],
    "useAI": false
  }'
```

### API响应示例

```json
{
  "articleContext": {
    "type": "tutorial",
    "niche": "技术B2B",
    "purpose": "教育",
    "targetAudience": "开发者",
    "contentLength": 2500,
    "readingTime": 5
  },
  "scores": {
    "experience": {
      "score": 7.5,
      "evidence": ["包含实践经验描述"],
      "issues": [],
      "strengths": ["内容展现实践经验"],
      "suggestions": ["增加更多案例研究"]
    },
    "expertise": { ... },
    "authoritativeness": { ... },
    "trustworthiness": { ... },
    "overall": 7.2
  },
  "analysis": {
    "strengths": ["内容展现实践经验"],
    "weaknesses": ["权威性证据不足"],
    "opportunities": ["提升引用质量"]
  },
  "summary": "这是一篇良好的内容，在经验、专业知识方面表现不错...",
  "suggestions": [
    {
      "priority": "high",
      "category": "权威性",
      "description": "权威性是最需要改进的方面",
      "actionItems": ["增加可信引用来源", "添加作者资质说明"]
    }
  ]
}
```

## 🏗 技术架构

### 技术栈

- **前端**：
  - Next.js 14 (App Router)
  - React 18
  - TypeScript
  - Tailwind CSS
  - Shadcn/ui 组件库
  - Lucide React 图标

- **后端**：
  - Next.js API Routes
  - Vercel Edge Functions（可选）
  - EEAT评估引擎（自研）

- **部署**：
  - Vercel（推荐）
  - 支持自托管

### 项目结构

```
eeat-evaluation-system/
├── app/                    # Next.js App Router
│   ├── api/               # API路由
│   │   ├── evaluate/      # 单篇评估API
│   │   └── batch-evaluate/ # 批量评估API
│   ├── globals.css        # 全局样式
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # 首页
├── components/            # React组件
│   ├── ui/               # 基础UI组件
│   ├── EEATScoreCard.tsx
│   ├── EvaluationForm.tsx
│   ├── EvaluationResults.tsx
│   └── ScoreCircle.tsx
├── lib/                   # 工具库
│   ├── utils.ts          # 通用工具函数
│   └── eeat-evaluator.ts # EEAT评估引擎
├── types/                 # TypeScript类型定义
│   └── eeat.ts
└── public/               # 静态资源
```

### 评估算法

系统基于Tom Winter的RFT框架开发：

1. **Role（角色）**：定义AI专家角色
2. **Task（任务）**：明确评估任务
3. **Format（格式）**：标准化JSON输出

评估过程：
1. 分析文章上下文（类型、利基、目的、受众）
2. 四维度评分（Experience、Expertise、Authoritativeness、Trustworthiness）
3. 生成证据和问题清单
4. 提供针对性改进建议
5. 输出完整评估报告

## ⚙️ 配置选项

### 环境变量

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `ZHIPU_API_KEY` | 智谱AI API密钥（推荐） | 否 |
| `OPENAI_API_KEY` | OpenAI API密钥（备选） | 否 |
| `NEXT_PUBLIC_APP_URL` | 应用URL（可选） | 否 |

### 自定义评估标准

您可以修改 `lib/eeat-evaluator.ts` 文件来自定义：

- 评分标准
- 评估维度权重
- 内容类型识别
- 利基市场分类

## 📊 评估标准说明

### Experience（经验）1-10分

- **1-3分**：纯理论，缺乏实践
- **4-6分**：有一定实践经验
- **7-8分**：丰富的第一手经验
- **9-10分**：深度案例研究和详细流程

### Expertise（专业知识）1-10分

- **1-3分**：表面或不准确信息
- **4-6分**：准确但深度有限
- **7-8分**：深入理解和最新信息
- **9-10分**：全面掌握和战略见解

### Authoritativeness（权威性）1-10分

- **1-3分**：无可信背书
- **4-6分**：有限引用或资质
- **7-8分**：可靠来源和作者资质
- **9-10分**：权威机构认可和原创研究

### Trustworthiness（可信度）1-10分

- **1-3分**：误导或缺乏透明度
- **4-6分**：基本透明但有改进空间
- **7-8分**：透明准确，可验证
- **9-10分**：卓越可信度，专业编辑

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

### 开发流程

1. Fork项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- Tom Winter - 提供RFT框架和E-E-A-T评估灵感
- Google - E-E-A-T评估标准
- Vercel - 优秀的部署平台
- Next.js团队 - 强大的React框架

## 📞 支持

如有问题或建议，请：

- 提交 [Issue](../../issues)
- 发起 [Discussion](../../discussions)
- 发送邮件至：[your-email@example.com]

## 📈 路线图

- [ ] URL文章抓取功能
- [ ] AI增强评估（集成OpenAI）
- [ ] 可视化图表展示
- [ ] 历史记录管理
- [ ] PDF报告导出
- [ ] 团队协作功能
- [ ] 更多内容类型支持
- [ ] 多语言支持

---

⭐ 如果这个项目对您有帮助，请给它一个星标！
