#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_questions.py
从你的 PDF / DOCX 启发式抽取题目，生成 questions.json（用于网页检索）。

用法：
  python build_questions.py --out questions.json

依赖：
  pip install pymupdf python-docx

说明：
- 这是 MVP 版本的抽取器：根据你材料里常见的“问题：/答案：/题号/选项”模式做解析。
- 如果你发现某一类题（例如“案例分析 101-136”）解析不准，把页面截图/一两页样例发我，我再把规则调到更准确。
"""

import argparse, json, re, os
from datetime import datetime

def try_import_pymupdf():
  try:
    import fitz  # PyMuPDF
    return fitz
  except Exception:
    return None

def read_pdf(path):
  fitz = try_import_pymupdf()
  if not fitz:
    raise RuntimeError("缺少 PyMuPDF。请执行：pip install pymupdf")
  doc = fitz.open(path)
  pages = []
  for i in range(doc.page_count):
    txt = doc.load_page(i).get_text("text")
    pages.append((i+1, txt))
  return pages

def read_docx(path):
  try:
    import docx
  except Exception:
    raise RuntimeError("缺少 python-docx。请执行：pip install python-docx")
  d = docx.Document(path)
  # 保留段落文本
  paras = [p.text for p in d.paragraphs]
  return paras

def normalize(s: str) -> str:
  s = s.replace("\r", "\n")
  s = re.sub(r"[\t ]+", " ", s)
  s = re.sub(r"\n{3,}", "\n\n", s)
  return s.strip()

def detect_type(stem, options):
  if options and re.search(r"\bA\.|A[、．。]", options): 
    # 选择题：如果有“多选/多项/可多选”字样判 multi
    if re.search(r"多选|多项|可多选|（多选）|\[多选\]", stem):
      return "multi"
    return "single"
  # 简单规则：包含“案例/情境/你将如何处理”倾向 case
  if re.search(r"案例|情境|来访者|客户|发生|你将如何|如何处理|应对", stem):
    return "case"
  return "short"

def extract_qa_blocks(text, file_name, page_no=None):
  """从一段 text 里抽取形如：
     问题：...（或 1. ...）
     答案：...
  """
  text = normalize(text)
  blocks = []
  # 优先匹配“问题：... 答案：...”
  pat = re.compile(r"(?:^|\n)\s*(?:题目|问题)\s*[:：]\s*(.+?)\n\s*(?:答案|参考答案)\s*[:：]\s*(.+?)(?=\n\s*(?:题目|问题)\s*[:：]|\Z)", re.S)
  for m in pat.finditer(text):
    stem = normalize(m.group(1))
    ans = normalize(m.group(2))
    if len(stem) < 6: 
      continue
    blocks.append((stem, ans))

  # 备选：匹配“数字题号 + 题干 + 答案：...”
  pat2 = re.compile(r"(?:^|\n)\s*(\d{1,3})[\.、]\s*(.+?)(?=\n\s*(?:答案|参考答案)\s*[:：])\n\s*(?:答案|参考答案)\s*[:：]\s*(.+?)(?=\n\s*\d{1,3}[\.、]|\Z)", re.S)
  for m in pat2.finditer(text):
    num = int(m.group(1))
    stem = normalize(m.group(2))
    ans = normalize(m.group(3))
    if len(stem) < 6:
      continue
    blocks.append((f"{num}. {stem}", ans))

  out = []
  for idx,(stem,ans) in enumerate(blocks, start=1):
    qid = f"{os.path.splitext(file_name)[0]}-p{page_no or 0}-q{idx}"
    out.append({
      "id": qid,
      "type": detect_type(stem, None),
      "module": None,
      "section": None,
      "number": None,
      "stem": stem,
      "options": None,
      "standardAnswer": ans,
      "myAnswer": "",
      "source": [{"file": file_name, "page": page_no}],
      "updatedAt": ""
    })
  return out

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--out", default="questions.json")
  ap.add_argument("--pdf", action="append", default=[], help="可指定多个 PDF 路径")
  ap.add_argument("--docx", action="append", default=[], help="可指定多个 DOCX 路径")
  args = ap.parse_args()

  # 默认用你这次上传的四个文件（如果路径存在）
  default_files = [
    ("/mnt/data/国际疗愈师培训项目_归元寰宇（2025年10月版）.pdf", "pdf"),
    ("/mnt/data/101-136 V.3.0.pdf", "pdf"),
    ("/mnt/data/伦理与法规1-10答案.pdf", "pdf"),
    ("/mnt/data/伦理题补充2.docx", "docx"),
  ]
  for p,t in default_files:
    if os.path.exists(p):
      if t=="pdf" and p not in args.pdf: args.pdf.append(p)
      if t=="docx" and p not in args.docx: args.docx.append(p)

  questions = []
  # PDF
  for path in args.pdf:
    file_name = os.path.basename(path)
    pages = read_pdf(path)
    for page_no, txt in pages:
      qs = extract_qa_blocks(txt, file_name, page_no=page_no)
      questions.extend(qs)

  # DOCX
  for path in args.docx:
    file_name = os.path.basename(path)
    paras = read_docx(path)
    text = "\n".join([p for p in paras if p.strip()])
    qs = extract_qa_blocks(text, file_name, page_no=None)
    questions.extend(qs)

  # 去重（按 stem）
  seen = set()
  deduped = []
  for q in questions:
    key = re.sub(r"\s+", "", q["stem"])
    if key in seen: 
      continue
    seen.add(key)
    deduped.append(q)

  # 写出
  with open(args.out, "w", encoding="utf-8") as f:
    json.dump(deduped, f, ensure_ascii=False, indent=2)

  print(f"OK: 输出 {len(deduped)} 题 -> {args.out}")

if __name__ == "__main__":
  main()
