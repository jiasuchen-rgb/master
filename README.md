# 题目检索（网页版 MVP - 方案A：纯前端静态站）

## 你得到什么
- 输入/粘贴题干关键词 → 模糊检索题目
- 右侧显示：原题 / 标准答案 / 我的答案（可编辑、自动保存到浏览器）
- 支持：按题型、按模块筛选
- 支持：导入 / 导出 我的答案（JSON）

## 文件说明
- index.html：页面
- app.js：逻辑（Fuse.js 模糊检索 + localStorage）
- questions.json：题库（可先用示例；你可以用 build_questions.py 自动生成）
- build_questions.py：从你上传的 PDF/DOCX 抽取题目并生成 questions.json（启发式解析；可再迭代）

## 本地运行（推荐）
1) 进入本目录
2) 启动一个静态服务器（任选其一）：
   - Python: `python -m http.server 8000`
   - Node: `npx serve .`
3) 浏览器打开：
   - http://localhost:8000

## 生成题库 questions.json
1) 确保你电脑装了 Python 3
2) 安装依赖（如果缺）：
   - `pip install pymupdf python-docx`
3) 执行：
   - `python build_questions.py --out questions.json`

如果解析效果不理想：你告诉我你最常用的题型/题号范围（例如“案例分析 101-136”），我可以把解析规则更贴合你的材料格式。
