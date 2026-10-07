#!/usr/bin/env python3
"""检查结构化中文稿的篇幅、标题、图片占位和 Markdown 围栏。"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def mask_fenced_blocks(text: str) -> str:
    return re.sub(
        r"```.*?```",
        lambda match: "".join("\n" if char == "\n" else " " for char in match.group()),
        text,
        flags=re.DOTALL,
    )


def body_before_source(text: str, source_heading: str) -> str:
    if not source_heading:
        return text
    pattern = re.compile(
        rf"^##+\s+{re.escape(source_heading)}\s*$", re.MULTILINE
    )
    match = pattern.search(text)
    return text[: match.start()] if match else text


def visible_body(text: str, source_heading: str) -> str:
    text = body_before_source(text, source_heading)
    text = re.sub(r"\A---\s*\n.*?\n---\s*(?:\n|\Z)", "", text, flags=re.DOTALL)
    text = mask_fenced_blocks(text)
    text = re.sub(r"^#{1,6}\s+.*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"!\[[^\]\n]*\]\([^\n)]*\)", "", text)
    text = re.sub(r"\[([^\]\n]+)\]\([^\n)]*\)", r"\1", text)
    text = re.sub(r"https?://[^\s)>]+", "", text)
    text = re.sub(r"<[^>\n]+>", "", text)
    text = re.sub(r"[`*_>]", "", text)
    return text


def han_count(text: str) -> int:
    return len(re.findall(r"[\u4e00-\u9fff]", text))


def extract_headings(text: str) -> list[tuple[int, str]]:
    text = mask_fenced_blocks(text)
    headings = []
    for match in re.finditer(r"^(#{1,6})\s+(.+?)\s*$", text, flags=re.MULTILINE):
        title = re.sub(r"\s+", " ", match.group(2)).strip()
        headings.append((len(match.group(1)), title))
    return headings


def format_heading(item: tuple[int, str]) -> str:
    return f"{'#' * item[0]} {item[1]}"


def main() -> int:
    parser = argparse.ArgumentParser(description="检查结构化中文稿的交付约束")
    parser.add_argument("path", help="待检查的 Markdown 文件")
    parser.add_argument("--outline", help="包含锁定标题结构的 Markdown 大纲")
    parser.add_argument("--target-han", type=int, help="目标正文汉字数")
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.10,
        help="篇幅允许偏差比例，默认 0.10",
    )
    parser.add_argument(
        "--source-heading",
        default="参考资料",
        help="此二级或更深标题及其后内容不计入正文，默认参考资料",
    )
    parser.add_argument(
        "--require-filled-images",
        action="store_true",
        help="仍有【这里需要配】占位时判为失败",
    )
    args = parser.parse_args()

    try:
        text = read_text(args.path)
    except (OSError, UnicodeError) as error:
        print(f"无法读取稿件。{error}", file=sys.stderr)
        return 2

    failures = []
    warnings = []
    body_han = han_count(visible_body(text, args.source_heading))
    headings = extract_headings(text)
    images = len(re.findall(r"!\[[^\]\n]*\]\([^\n)]*\)", text))
    placeholders = len(re.findall(r"【这里需要配\{\{.*?\}\}】", text))
    mermaid_blocks = len(re.findall(r"```mermaid\s*\n.*?```", text, flags=re.DOTALL))
    fence_count = len(re.findall(r"^```", text, flags=re.MULTILINE))

    if fence_count % 2:
        failures.append("Markdown 代码围栏没有闭合。")

    if args.target_han is not None:
        low = round(args.target_han * (1 - args.tolerance))
        high = round(args.target_han * (1 + args.tolerance))
        if not low <= body_han <= high:
            failures.append(
                f"正文汉字数 {body_han}，目标范围为 {low} 至 {high}。"
            )

    if args.outline:
        try:
            outline_headings = extract_headings(read_text(args.outline))
        except (OSError, UnicodeError) as error:
            print(f"无法读取大纲。{error}", file=sys.stderr)
            return 2
        if headings != outline_headings:
            failures.append("稿件标题结构与锁定大纲不一致。")
            maximum = max(len(headings), len(outline_headings))
            for index in range(maximum):
                actual = format_heading(headings[index]) if index < len(headings) else "<缺失>"
                expected = (
                    format_heading(outline_headings[index])
                    if index < len(outline_headings)
                    else "<不应出现>"
                )
                if actual != expected:
                    warnings.append(
                        f"第 {index + 1} 个标题，稿件为 {actual}，大纲为 {expected}。"
                    )

    if placeholders:
        message = f"仍有 {placeholders} 个图片占位。"
        if args.require_filled_images:
            failures.append(message)
        else:
            warnings.append(message)

    print(f"正文汉字数 {body_han}")
    print(f"标题 {len(headings)} 个，图片 {images} 张，Mermaid {mermaid_blocks} 个")

    if failures:
        print("\n需要修改")
        for item in failures:
            print(f"- {item}")

    if warnings:
        print("\n需要人工判断")
        for item in warnings:
            print(f"- {item}")

    if not failures and not warnings:
        print("\n结构化交付检查通过。")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
