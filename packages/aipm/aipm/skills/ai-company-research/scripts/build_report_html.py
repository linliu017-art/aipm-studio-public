from __future__ import annotations

import argparse
import base64
import html
import re
import sys
import tempfile
from pathlib import Path


PLACEHOLDER = "__MD_BASE64_PLACEHOLDER__"
DEFAULT_TEMPLATE = Path(__file__).resolve().parent.parent / "company_report_template.html"
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
MD_SOURCE_RE = re.compile(
    r'<script[^>]+id=["\']md-source["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


class BuildError(RuntimeError):
    """Raised when a report cannot be built or verified safely."""


def parse_frontmatter(markdown: str) -> dict[str, str]:
    match = FRONTMATTER_RE.search(markdown)
    if not match:
        return {}
    result: dict[str, str] = {}
    for raw_line in match.group(1).splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#") or ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        result[key.strip()] = value.strip().strip("\"'")
    return result


def render_title_placeholders(template_text: str, markdown: str, markdown_path: Path) -> str:
    frontmatter = parse_frontmatter(markdown)
    subject = frontmatter.get("subject") or markdown_path.stem
    mode = frontmatter.get("mode", "").strip().lower()
    purpose = {
        "company": "公司调研",
        "client": "拜访作战地图",
        "investor": "投资机构拜访地图",
    }.get(mode, "调研报告")
    return (
        template_text.replace("{{对方主体}}", html.escape(subject))
        .replace("{{调研目的}}", html.escape(purpose))
    )


def decode_embedded_markdown(report_html: str) -> bytes:
    matches = MD_SOURCE_RE.findall(report_html)
    if len(matches) != 1:
        raise BuildError(
            f"generated HTML must contain exactly one #md-source block; found {len(matches)}"
        )

    payload = html.unescape(matches[0]).strip()
    try:
        return base64.b64decode(payload, validate=True)
    except (ValueError, UnicodeError) as error:
        raise BuildError(f"generated #md-source is not valid Base64: {error}") from error


def build_report_html(
    markdown_path: Path,
    output_path: Path | None = None,
    template_path: Path = DEFAULT_TEMPLATE,
    *,
    force: bool = False,
) -> Path:
    markdown_path = markdown_path.expanduser().resolve()
    template_path = template_path.expanduser().resolve()
    output_path = (
        output_path.expanduser().resolve()
        if output_path is not None
        else markdown_path.with_suffix(".html")
    )

    if not markdown_path.is_file():
        raise BuildError(f"Markdown file does not exist: {markdown_path}")
    if not template_path.is_file():
        raise BuildError(f"HTML template does not exist: {template_path}")
    if output_path == markdown_path:
        raise BuildError("output path must not overwrite the Markdown source")
    if output_path == template_path:
        raise BuildError("output path must not overwrite the HTML template")
    if output_path.exists() and not force:
        raise BuildError(f"output already exists (use --force to overwrite): {output_path}")

    markdown_bytes = markdown_path.read_bytes()
    try:
        markdown_text = markdown_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise BuildError(f"Markdown is not valid UTF-8: {markdown_path}") from error

    template_text = template_path.read_text(encoding="utf-8")
    placeholder_count = template_text.count(PLACEHOLDER)
    if placeholder_count != 1:
        raise BuildError(
            f"template must contain {PLACEHOLDER!r} exactly once; found {placeholder_count}"
        )

    payload = base64.b64encode(markdown_bytes).decode("ascii")
    report_html = render_title_placeholders(template_text, markdown_text, markdown_path)
    report_html = report_html.replace(PLACEHOLDER, payload)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if force else "x"
    try:
        with output_path.open(mode, encoding="utf-8", newline="") as output_file:
            output_file.write(report_html)
    except FileExistsError as error:
        raise BuildError(
            f"output already exists (use --force to overwrite): {output_path}"
        ) from error

    written_html = output_path.read_text(encoding="utf-8")
    decoded_markdown = decode_embedded_markdown(written_html)
    if decoded_markdown != markdown_bytes:
        raise BuildError(
            f"verification failed: embedded Markdown differs from source: {output_path}"
        )

    return output_path


def self_test() -> int:
    with tempfile.TemporaryDirectory(prefix="customer-research-html-") as temp_dir:
        root = Path(temp_dir)
        markdown_path = root / "测试公司调研_v1.md"
        template_path = root / "company_report_template.html"
        nested_output = root / "deliverables" / "测试公司调研_v1.html"

        original_markdown = "# 测试公司\n\n中文、emoji 🧪 与末尾换行。\n"
        markdown_path.write_text(original_markdown, encoding="utf-8")
        template_path.write_text(
            '<!doctype html><script id="md-source" type="text/plain">'
            f"{PLACEHOLDER}</script>",
            encoding="utf-8",
        )

        built_path = build_report_html(
            markdown_path,
            nested_output,
            template_path,
        )
        if built_path != nested_output.resolve() or not built_path.is_file():
            raise AssertionError("normal build did not create the requested output")
        if decode_embedded_markdown(built_path.read_text(encoding="utf-8")) != markdown_path.read_bytes():
            raise AssertionError("normal build did not preserve Markdown bytes")

        try:
            build_report_html(markdown_path, nested_output, template_path)
        except BuildError as error:
            if "already exists" not in str(error):
                raise AssertionError("existing output failed for an unexpected reason") from error
        else:
            raise AssertionError("existing output was overwritten without force=True")

        updated_markdown = """---
subject: 测试 & 公司
mode: company
---
# 测试公司

force 覆盖后的新内容。
"""
        markdown_path.write_text(updated_markdown, encoding="utf-8")
        build_report_html(markdown_path, nested_output, template_path, force=True)
        if decode_embedded_markdown(nested_output.read_text(encoding="utf-8")) != markdown_path.read_bytes():
            raise AssertionError("force=True output did not preserve updated Markdown bytes")

        default_output = markdown_path.with_suffix(".html")
        build_report_html(markdown_path)
        if not default_output.is_file():
            raise AssertionError("default output path and installed template were not used")
        default_html = default_output.read_text(encoding="utf-8")
        if "<title>测试 &amp; 公司 · 公司调研</title>" not in default_html:
            raise AssertionError("installed template title placeholders were not rendered")
        if re.search(r"\{\{[^{}\n]+\}\}", default_html):
            raise AssertionError("generated HTML still contains a template placeholder")

        # Preserve original bytes while parsing metadata from BOM/CRLF Markdown.
        bom_path = root / "带空格 BOM 测试_v1.md"
        bom_bytes = b"\xef\xbb\xbf" + updated_markdown.replace("\n", "\r\n").encode("utf-8")
        bom_path.write_bytes(bom_bytes)
        bom_output = build_report_html(bom_path)
        bom_html = bom_output.read_text(encoding="utf-8")
        if "<title>测试 &amp; 公司 · 公司调研</title>" not in bom_html:
            raise AssertionError("BOM/CRLF Markdown metadata was not parsed")
        if decode_embedded_markdown(bom_html) != bom_bytes:
            raise AssertionError("BOM/CRLF Markdown bytes were not preserved")

    print("self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build a single-file customer-research HTML report from Markdown."
    )
    parser.add_argument("markdown", type=Path, nargs="?")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        try:
            return self_test()
        except (AssertionError, BuildError, OSError, UnicodeError) as error:
            print(f"self-test failed: {error}", file=sys.stderr)
            return 1
    if args.markdown is None:
        parser.error("markdown is required unless --self-test is used")

    try:
        output_path = build_report_html(
            args.markdown,
            args.output,
            args.template,
            force=args.force,
        )
    except (BuildError, OSError, UnicodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
