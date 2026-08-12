#!/usr/bin/env python3
"""Build the website data file from the preserved workbook extraction."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


STAGES = [
    {
        "title": "阶段 1｜项目输入与唯一事实源",
        "purpose": "集中保存论文全文、创新点、命名、故事、模型理解、困难、场景、代码、实验结果和关键公式等后续阶段共同依赖的输入。",
        "sheets": [("画图流程", "文章信息文档", "single")],
    },
    {
        "title": "阶段 2｜Claim、故事、挑战与创新点设计",
        "purpose": "从现有代码、场景与实验中提炼论文主张，并建立故事、挑战、创新点和方法解释之间的对应关系。",
        "sheets": [
            ("ICML创新表", "ICML创新表", "matrix"),
            ("ICML创新表", "CVPR创新点参考", "matrix"),
            ("论文结构表", "calim验证表", "single"),
        ],
    },
    {
        "title": "阶段 3｜论文整体结构与实验蓝图",
        "purpose": "按章节确定正文、附录、实验类型、图表位置和段落功能，为后续分章节写作提供顺序和边界。",
        "sheets": [
            ("论文结构表", "正文", "records"),
            ("论文结构表", "附录", "records"),
        ],
    },
    {
        "title": "阶段 4｜分章节写作提示词",
        "purpose": "在共享事实源和术语体系下，分别生成 Introduction、贡献、Method、摘要和 Caption 等局部文本。",
        "sheets": [
            ("ICML创新表", "论文写作提示词", "prompt_grid"),
            ("论文结构表", "论文写作提示词", "prompt_grid"),
            ("论文结构表", "摘要提示词", "single"),
            ("论文结构表", "caption提示词", "single"),
        ],
    },
    {
        "title": "阶段 5｜论文图形设计、生成与优化",
        "purpose": "从文章信息文档出发，生成主图与模块子图，修订第一版图片，并完成可编辑矢量化准备。",
        "sheets": [
            ("画图流程", "论文模型图生成与验证培训手册", "steps"),
            ("画图流程", "主图提示词", "single"),
            ("画图流程", "优化图片", "single"),
            ("画图流程", "A子图提示词", "single"),
            ("画图流程", "B子图提示词", "single"),
        ],
    },
    {
        "title": "阶段 6｜一致性验证与投稿前自检",
        "purpose": "核对图、文、代码、公式、数字、命名和实验之间的一致性，并使用投稿前清单逐项验收。",
        "sheets": [
            ("画图流程", "验证提示词", "single"),
            ("论文结构表", "自检表", "single"),
        ],
    },
]

JSON_FILES = {
    "ICML创新表": "ICML创新表.xml.json",
    "论文结构表": "论文结构表.xml.json",
    "画图流程": "画图流程.xml.json",
}

CELL_RE = re.compile(r"([A-Z]+)(\d+)")


def col_to_num(col: str) -> int:
    result = 0
    for char in col:
        result = result * 26 + ord(char) - 64
    return result


def cell_sort_key(ref: str) -> tuple[int, int]:
    match = CELL_RE.fullmatch(ref)
    if not match:
        raise ValueError(f"Unsupported cell reference: {ref}")
    return int(match.group(2)), col_to_num(match.group(1))


def slug(stage_index: int, sheet_index: int) -> str:
    return f"stage-{stage_index}-sheet-{sheet_index}"


def load_books(source_dir: Path) -> dict[str, dict[str, dict[str, str]]]:
    books = {}
    for book, filename in JSON_FILES.items():
        raw = json.loads((source_dir / filename).read_text(encoding="utf-8"))
        sheets = {}
        for sheet in raw["sheets"]:
            cells = {}
            for row in sheet["cells"]:
                for ref, payload in row.items():
                    value = payload.get("value")
                    if value not in (None, ""):
                        cells[ref] = str(value)
            sheets[sheet["name"]] = cells
        books[book] = sheets
    return books


def build_payload(books: dict[str, dict[str, dict[str, str]]]) -> dict:
    stages = []
    total_cells = 0
    for stage_index, stage in enumerate(STAGES, 1):
        stage_item = {
            "id": f"stage-{stage_index}",
            "number": stage_index,
            "title": stage["title"],
            "purpose": stage["purpose"],
            "sheets": [],
        }
        for sheet_index, (book, sheet, renderer) in enumerate(stage["sheets"], 1):
            cells = books[book][sheet]
            case_number_by_col = {}
            if renderer == "matrix":
                project_cols = sorted(
                    {
                        CELL_RE.fullmatch(ref).group(1)
                        for ref in cells
                        if CELL_RE.fullmatch(ref) and CELL_RE.fullmatch(ref).group(1) != "A"
                    },
                    key=col_to_num,
                )
                case_number_by_col = {col: index for index, col in enumerate(project_cols, 1)}
            ordered = [
                {
                    "ref": ref,
                    "value": (
                        f"参考案例 {case_number_by_col[CELL_RE.fullmatch(ref).group(1)]:02d}"
                        if renderer == "matrix"
                        and CELL_RE.fullmatch(ref)
                        and CELL_RE.fullmatch(ref).group(2) == "1"
                        and CELL_RE.fullmatch(ref).group(1) != "A"
                        else cells[ref]
                    ),
                }
                for ref in sorted(cells, key=cell_sort_key)
            ]
            total_cells += len(ordered)
            stage_item["sheets"].append(
                {
                    "id": slug(stage_index, sheet_index),
                    "book": book,
                    "bookFile": f"{book}.xlsx",
                    "name": sheet,
                    "renderer": renderer,
                    "cells": ordered,
                }
            )
        stages.append(stage_item)
    return {
        "meta": {"stageCount": len(stages), "sheetCount": 17, "cellCount": total_cells},
        "stages": stages,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = build_payload(load_books(args.source_dir))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    args.output.write_text(f"window.WORKFLOW_DATA={serialized};\n", encoding="utf-8")
    print(
        f"Wrote {payload['meta']['cellCount']} cells across "
        f"{payload['meta']['sheetCount']} sheets to {args.output}"
    )


if __name__ == "__main__":
    main()
