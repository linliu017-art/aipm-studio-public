from __future__ import annotations

import argparse
import base64
import html
import json
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse


FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
MD_SOURCE_RE = re.compile(
    r'<script[^>]+id=["\']md-source["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
HREF_RE = re.compile(r'\bhref=["\']([^"\']+)["\']', re.I)
VERSION_RE = re.compile(r"_((?:v|V)\d+(?:\.\d+)*)$")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.M)
SOURCE_ID_RE = re.compile(r"\[(S\d{2,})\]", re.I)
HTTP_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
LOCAL_MARKDOWN_LINK_RE = re.compile(
    r"\]\((?:<)?(?:/|[A-Za-z]:[\\/])[^)\n>]+(?:>)?\)"
)
LOCAL_MARKDOWN_LINK_TARGET_RE = re.compile(
    r"\]\((?:<)?((?:/|[A-Za-z]:[\\/])[^)\n>]+)(?:>)?\)"
)
VALID_MODES = {"company", "client", "investor"}
VALID_DEPTHS = {"quick", "standard", "deep"}
PLACEHOLDERS = (
    "__MD_BASE64_PLACEHOLDER__",
    "TODO",
    "TBD",
    "待生成",
    "Lorem ipsum",
)
TEMPLATE_TOKEN_RE = re.compile(r"\{\{[^{}\n]+\}\}")
BROKEN_STRONG_LABEL_RE = re.compile(
    r"\*\*[^*\n]{1,60}[：:]\*\*(?=[A-Za-z0-9\u3400-\u9fff])"
)
REQUIRED_FRONTMATTER = (
    "title",
    "report_id",
    "subject",
    "mode",
    "version",
    "as_of",
    "generated_at",
)
COMPANY_REQUIRED_FRONTMATTER = (
    "depth",
    "market_status",
)
EVIDENCE_MARKERS = (
    "[L0",
    "[L1",
    "[L2",
    "[L3",
    "[L4",
    "[L5",
    "已查证",
    "推断",
    "不确定",
    "公司称",
    "第三方估算",
    "据此判断",
    "公开未见",
    "未披露",
)
COMPANY_SECTION_RULES = (
    (
        "decision_summary",
        "决策摘要",
        (
            r"决策摘要|执行摘要|核心判断|整体概述|一句话结论|核心结论|结论先行",
        ),
    ),
    (
        "subject_scope",
        "主体/范围",
        (
            r"(?:公司|企业)?主体(?:核验|识别|信息|概况|排歧|与|及|和|范围|边界)",
            r"(?:调研|研究|报告)(?:范围|边界|口径)",
            r"(?:公司|企业)(?:概况|画像|基本信息)",
            r"(?:工商|注册)(?:信息|主体)",
        ),
    ),
    (
        "business_product",
        "业务/产品",
        (
            r"(?:当前|主营|核心)?业务",
            r"(?:产品|服务)(?:与|及|和)?(?:业务|矩阵|组合|全景)",
        ),
    ),
    (
        "technology_rnd",
        "技术/研发",
        (
            r"技术",
            r"研发|科研|专利|知识产权|创新能力",
        ),
    ),
    (
        "finance_capital",
        "财务/资本",
        (
            r"财务|财报|经营数据|经营质量|资本|融资|股权|估值|营收|利润",
        ),
    ),
    (
        "commercial_customer",
        "商业化/客户",
        (
            r"商业化|商业模式|商业质量|变现|付费|收入模式|客户|销售|渠道|获客|收费模式|交付模式",
        ),
    ),
    (
        "competition_substitute",
        "竞争/替代",
        (
            r"竞争|竞品|替代|对标",
        ),
    ),
    (
        "recent_changes",
        "近期变化",
        (
            r"近期变化|最近变化|近期动态|最近动态|关键事件|战略变化|近况",
        ),
    ),
    (
        "risk_counterevidence",
        "风险/反对证据",
        (
            r"风险|反对证据|反方证据|反证|挑战|不利证据|失败模式|证伪",
        ),
    ),
    (
        "conclusion_next",
        "结论/下一步",
        (
            r"结论与下一步|结论及下一步|结论与建议|结论建议|结论与后续(?:核验|验证|动作)?|决策结论|下一步|行动建议",
        ),
    ),
    (
        "sources",
        "来源",
        (
            r"来源|参考资料|参考文献|资料出处|信源|引用资料|证据清单",
        ),
    ),
    (
        "gaps",
        "信息缺口/待确认",
        (
            r"信息缺口|待确认|待核实|待验证|未知事项|未决问题|公开信息局限|研究局限",
        ),
    ),
)
COMPANY_CORE_SECTIONS = (
    ("business_product", "业务/产品"),
    ("technology_rnd", "技术/研发"),
    ("finance_capital", "财务/资本"),
    ("commercial_customer", "商业化/客户"),
)
COMPANY_V2_MODULES = (
    ("overview", "公司总览"),
    ("business", "业务报告"),
    ("technology", "技术报告"),
    ("quality_risk", "财务商业质量与风险"),
    ("sources_gaps", "来源与信息缺口"),
)
DESIGN_SYSTEM_MARKER = "company-research-v2"
HTML_START_TAG_RE = re.compile(
    r"<(?P<tag>[a-z][a-z0-9:-]*)\b(?P<attrs>[^<>]*)>",
    re.I,
)
HTML_ATTR_RE = re.compile(
    r"(?P<name>[^\s=/>]+)"
    r"(?:\s*=\s*(?:\"(?P<double>[^\"]*)\"|'(?P<single>[^']*)'|(?P<bare>[^\s\"'=<>`]+)))?",
    re.I,
)
REDUCED_MOTION_RE = re.compile(
    r"@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)",
    re.I,
)
PRINT_MEDIA_RE = re.compile(r"@media\s+print\b", re.I)
LEGACY_THEME_RE = re.compile(r"\btheme-sw(?:-[a-z0-9_-]+)?\b", re.I)
LEGACY_ORB_RE = re.compile(r"\borb(?:-[a-z0-9_-]+)?\b", re.I)
LINEAR_GRADIENT_RE = re.compile(r"\blinear-gradient\s*\(", re.I)
BOX_SHADOW_RE = re.compile(r"(?<![-\w])box-shadow\s*:", re.I)
VISIBLE_EMOJI_RE = re.compile(
    "["
    "\u2600-\u26ff"
    "\u2700-\u27bf"
    "\U0001f000-\U0001faff"
    "]"
)
CLIENT_SECTION_RULES = (
    ("公司底图", (r"主体|公司底图|当前业务|业务与产品|公司概况",)),
    ("机会/需求", (r"机会|真实需求|客户需求|痛点|采购信号",)),
    ("决策链", (r"决策链|关键人|决策人|拍板人",)),
    ("我方切入/验证", (r"我方|方案切入|最小验证|验证方案|实施锚点",)),
    ("双向问题", (r"双向问题|对方可能问|我方主动问|discovery",)),
    ("议程/后续", (r"会议议程|议程|后续动作|下一步",)),
    ("来源", (r"来源|参考资料|参考文献|资料出处",)),
    ("风险/待确认", (r"风险|待确认|待核实|信息缺口",)),
)
INVESTOR_SECTION_RULES = (
    ("机构/基金", (r"机构与基金|基金主体|机构主体|基金概况",)),
    ("投资主题/节奏", (r"投资主题|出手节奏|投资阶段|票面",)),
    ("案例/组合", (r"近期案例|已投项目|投资组合|组合冲突|退出",)),
    ("决策人/投决", (r"决策人|合伙人|投决流程|投资决策",)),
    ("匹配/差异化", (r"我方匹配|项目匹配|差异化|叙事与匹配",)),
    ("问题/下一步", (r"双向问题|问题与下一步|后续动作|下一步",)),
    ("来源", (r"来源|参考资料|参考文献|资料出处",)),
    ("风险/待确认", (r"风险|待确认|待核实|信息缺口",)),
)
GAP_DISCLOSURE_RE = re.compile(
    r"公开(?:渠道|资料|信息)?(?:中)?未见|"
    r"未(?:披露|公开|查询到|检索到|查到|能确认)|"
    r"无法(?:确认|核实|获取|适用)|不适用|"
    r"暂无(?:公开|披露|可得)?|尚无.{0,12}(?:公开|证据|披露)|"
    r"待(?:确认|核实|补充)|(?:资料|证据|信息)不足"
)
COMPANY_EVIDENCE_LANGUAGE_RE = re.compile(
    r"(?:监管|交易所|年报|财报|公告|审计报告).{0,10}(?:显示|披露|列示|确认)|"
    r"(?:公司|企业|官网|管理层|高管).{0,8}(?:称|表示|披露|列示|宣称)|"
    r"第三方.{0,8}(?:估算|估计|口径|预测)|"
    r"据此.{0,8}(?:判断|推断)|分析(?:判断|推断)|"
    r"已(?:证实|查证)|不确定|推断"
)
PRIVATE_FINANCE_LIMIT_RE = re.compile(
    r"(?:公开|可得|披露|监管).{0,20}(?:未见|没有|暂无|有限|不足|缺少|无法|不完整)|"
    r"未(?:披露|公开|查询到|检索到|获得|获取).{0,16}(?:财务|财报|营收|收入|利润|现金流|审计)?|"
    r"(?:财务|财报|营收|收入|利润|现金流).{0,24}(?:无法确认|难以确认|不可得|未披露|公开未见|暂无公开)|"
    r"非上市.{0,24}(?:未披露|公开|财务|财报)"
)
LISTED_PERIOD_RE = re.compile(
    r"报告期|财年|财政年度|会计年度|"
    r"截至\s*(?:19|20)\d{2}|"
    r"(?:19|20)\d{2}\s*年(?:度|全年|上半年|下半年|年报|中报|季报)|"
    r"FY\s*(?:19|20)\d{2}|(?:19|20)\d{2}\s*Q[1-4]|Q[1-4]\s*(?:19|20)\d{2}",
    re.I,
)
LISTED_CURRENCY_RE = re.compile(
    r"币种|人民币|CNY|RMB|美元|USD|港元|HKD|欧元|EUR|英镑|GBP|日元|JPY",
    re.I,
)
LISTED_UNIT_RE = re.compile(
    r"单位(?:为|是|：|:)?|(?:人民币|美元|港元|欧元|英镑|日元)?\s*(?:千|万|百万|千万|亿)元|"
    r"\b(?:thousand|million|billion)\b",
    re.I,
)
LISTED_SCOPE_RE = re.compile(
    r"合并(?:报表|财务报表|口径|范围)?|集团口径|单体(?:报表|口径)?|"
    r"母公司口径|consolidated|standalone|parent.company",
    re.I,
)
LISTED_METRIC_RULES = (
    ("收入", re.compile(r"营业收入|营收|收入")),
    ("利润/亏损", re.compile(r"利润|亏损")),
    ("经营现金流", re.compile(r"经营(?:活动)?(?:产生的)?现金流|经营现金流")),
    ("研发", re.compile(r"研发")),
    ("分部/收入结构", re.compile(r"分部|业务线|地区收入|收入结构")),
)
PRIVATE_DISCLOSED_FINANCE_RE = re.compile(
    r"经审计(?:的)?(?:财务报表|财报|年报)|审计报告|公开发债|债券募集说明书|"
    r"招股书|监管申报.{0,12}(?:收入|营收|利润|现金流)|"
    r"正式披露.{0,12}(?:收入|营收|利润|现金流)"
)
SUBSIDIARY_TARGET_SCOPE_RE = re.compile(
    r"目标(?:子公司|主体)|子公司(?:自身|单体|口径)|单体(?:口径|报表)"
)
SUBSIDIARY_PARENT_SCOPE_RE = re.compile(
    r"母公司|集团|合并(?:口径|报表)"
)
SUBSIDIARY_LIMIT_RE = re.compile(
    r"无法(?:拆分|归属|确认)|不能归属|不应归属|未(?:单独|分别)披露|"
    r"不可直接归(?:于|属)"
)
INSTITUTION_FINANCE_RE = re.compile(
    r"基金(?:规模|存续期|出资|募集)|管理(?:规模|资产)|AUM|票面|投资节奏|"
    r"预算|捐赠|拨款|不适用|公开.{0,12}(?:未披露|未见)|无法确认",
    re.I,
)
SOURCE_METADATA_RULES = (
    ("发布方/类型", re.compile(r"发布方|发布机构|来源类型|信源类型|发布方/类型")),
    ("发布日期", re.compile(r"发布日期|数据日期|报告日期|发布日期或数据日期")),
    ("访问日期", re.compile(r"访问日期|获取日期|查阅日期")),
    ("支持内容", re.compile(r"支持内容|支持结论|证明内容|用途")),
)


def normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")


def parse_html_attributes(raw_attributes: str) -> dict[str, str]:
    attributes: dict[str, str] = {}
    for match in HTML_ATTR_RE.finditer(raw_attributes):
        value = next(
            (
                candidate
                for candidate in (
                    match.group("double"),
                    match.group("single"),
                    match.group("bare"),
                )
                if candidate is not None
            ),
            "",
        )
        attributes[match.group("name").lower()] = html.unescape(value)
    return attributes


def html_start_tags(raw_html: str, tag_name: str | None = None) -> list[dict[str, str]]:
    tags: list[dict[str, str]] = []
    for match in HTML_START_TAG_RE.finditer(raw_html):
        if tag_name and match.group("tag").lower() != tag_name.lower():
            continue
        attributes = parse_html_attributes(match.group("attrs"))
        attributes["__tag__"] = match.group("tag").lower()
        tags.append(attributes)
    return tags


def strip_template_comments(raw_html: str) -> str:
    without_html_comments = re.sub(r"<!--.*?-->", "", raw_html, flags=re.S)
    without_block_comments = re.sub(
        r"/\*.*?\*/",
        "",
        without_html_comments,
        flags=re.S,
    )
    return re.sub(
        r"(?m)^[ \t]*//[^\n]*(?:\n|$)",
        "",
        without_block_comments,
    )


def audit_html_design_contract(html_text: str) -> tuple[list[str], dict]:
    errors: list[str] = []
    visible_html = MD_SOURCE_RE.sub("", html_text)
    all_tags = html_start_tags(visible_html)

    html_tags = [tag for tag in all_tags if tag["__tag__"] == "html"]
    has_design_marker = any(
        tag.get("data-design-system") == DESIGN_SYSTEM_MARKER for tag in html_tags
    )
    if not has_design_marker:
        errors.append(
            'HTML 缺少 <html data-design-system="company-research-v2"> 设计系统标记'
        )

    anchors = [tag for tag in all_tags if tag["__tag__"] == "a"]
    ids = {tag.get("id") for tag in all_tags if tag.get("id")}
    has_skip_link = any(
        "skip-link" in tag.get("class", "").split()
        and tag.get("href") == "#report-content"
        for tag in anchors
    )
    if not has_skip_link:
        errors.append('HTML 缺少 .skip-link[href="#report-content"]')
    if "report-content" not in ids:
        errors.append('HTML 缺少 skip link 目标 #report-content')

    view_nav_blocks: list[str] = []
    view_nav_ranges: list[tuple[int, int]] = []
    for match in re.finditer(r"<nav\b(?P<attrs>[^<>]*)>(?P<body>.*?)</nav\s*>", visible_html, re.I | re.S):
        attributes = parse_html_attributes(match.group("attrs"))
        if attributes.get("id") == "view-nav" and "data-view-nav" in attributes:
            view_nav_blocks.append(match.group("body"))
            view_nav_ranges.append(match.span())
    if not view_nav_blocks:
        errors.append("HTML 缺少 nav#view-nav[data-view-nav] 双视角导航")
    nav_links = [
        tag
        for block in view_nav_blocks
        for tag in html_start_tags(block, "a")
    ]
    panels = html_start_tags(visible_html, "section")
    html_outside_view_nav = visible_html
    for start, end in reversed(view_nav_ranges):
        html_outside_view_nav = (
            html_outside_view_nav[:start] + html_outside_view_nav[end:]
        )
    has_dynamic_panel_writer = bool(
        re.search(
            r"(?:setAttribute\s*\(\s*['\"]data-view-panel['\"]|"
            r"\.dataset\.viewPanel\s*=)",
            html_outside_view_nav,
            re.I,
        )
    )
    has_dynamic_id_writer = bool(
        re.search(
            r"(?:\.id\s*=|setAttribute\s*\(\s*['\"]id['\"])",
            html_outside_view_nav,
            re.I,
        )
    )
    expected_views = {
        "business": "business-report",
        "technology": "technology-report",
    }
    valid_view_links = 0
    valid_view_panels = 0
    for view_name, target_id in expected_views.items():
        if any(
            tag.get("data-view-link") == view_name
            and tag.get("href") == f"#{target_id}"
            for tag in nav_links
        ):
            valid_view_links += 1
        else:
            errors.append(
                f"HTML 双视角导航缺少 {view_name} 锚点 #{target_id}"
            )
        has_static_panel = any(
            tag.get("data-view-panel") == view_name
            and tag.get("id") == target_id
            for tag in panels
        )
        has_dynamic_panel = bool(
            has_dynamic_panel_writer
            and has_dynamic_id_writer
            and re.search(
                rf"['\"]{re.escape(target_id)}['\"]",
                html_outside_view_nav,
                re.I,
            )
        )
        if has_static_panel or has_dynamic_panel:
            valid_view_panels += 1
        else:
            errors.append(
                f"HTML 缺少 section#{target_id}[data-view-panel=\"{view_name}\"]"
            )

    collapse_buttons = [
        tag
        for tag in html_start_tags(visible_html, "button")
        if tag.get("aria-expanded", "").lower() in {"true", "false"}
    ]
    if not collapse_buttons:
        errors.append("HTML 缺少 button[aria-expanded] 语义折叠控件")

    has_reduced_motion = bool(REDUCED_MOTION_RE.search(visible_html))
    if not has_reduced_motion:
        errors.append("HTML CSS 缺少 @media (prefers-reduced-motion: reduce)")
    has_print_css = bool(PRINT_MEDIA_RE.search(visible_html))
    if not has_print_css:
        errors.append("HTML CSS 缺少 @media print")

    legacy_visual_tokens: list[str] = []
    if LEGACY_THEME_RE.search(visible_html):
        legacy_visual_tokens.append("theme-sw")
    if LEGACY_ORB_RE.search(visible_html):
        legacy_visual_tokens.append("orb")
    if legacy_visual_tokens:
        errors.append(
            "HTML 仍包含废弃的旧视觉组件：" + ", ".join(legacy_visual_tokens)
        )

    comment_free_html = strip_template_comments(visible_html)
    style_blocks = re.findall(
        r"<style\b[^<>]*>(.*?)</style\s*>",
        comment_free_html,
        re.I | re.S,
    )
    script_blocks = re.findall(
        r"<script\b[^<>]*>(.*?)</script\s*>",
        comment_free_html,
        re.I | re.S,
    )
    inline_styles = [
        tag["style"]
        for tag in html_start_tags(comment_free_html)
        if tag.get("style")
    ]
    style_surface = "\n".join(style_blocks + inline_styles + script_blocks)
    linear_gradient_count = len(LINEAR_GRADIENT_RE.findall(style_surface))
    if linear_gradient_count:
        errors.append("HTML 视觉规范禁止 linear-gradient(...)")
    box_shadow_count = len(BOX_SHADOW_RE.findall(style_surface))
    if box_shadow_count:
        errors.append("HTML 视觉规范禁止 box-shadow")

    visible_emojis = sorted(set(VISIBLE_EMOJI_RE.findall(comment_free_html)))
    if visible_emojis:
        errors.append(
            "HTML 可见模板禁止 emoji：" + " ".join(visible_emojis[:10])
        )

    return errors, {
        "design_system": DESIGN_SYSTEM_MARKER if has_design_marker else None,
        "skip_link": has_skip_link and "report-content" in ids,
        "view_links": valid_view_links,
        "view_panels": valid_view_panels,
        "collapsible_buttons": len(collapse_buttons),
        "reduced_motion": has_reduced_motion,
        "print_css": has_print_css,
        "legacy_visual_tokens": legacy_visual_tokens,
        "linear_gradients": linear_gradient_count,
        "box_shadows": box_shadow_count,
        "visible_emojis": len(visible_emojis),
    }


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


def extract_version(path: Path) -> str | None:
    match = VERSION_RE.search(path.stem)
    return match.group(1).lower() if match else None


def decode_embedded_markdown(raw_html: str) -> tuple[str | None, str | None]:
    match = MD_SOURCE_RE.search(raw_html)
    if not match:
        return None, "HTML 缺少 #md-source"
    payload = html.unescape(match.group(1)).strip()
    if not payload:
        return None, "#md-source 为空"
    try:
        decoded = base64.b64decode(payload, validate=True).decode("utf-8")
    except Exception as error:  # noqa: BLE001
        return None, f"#md-source 不是有效 UTF-8 Base64：{error}"
    return normalize_text(decoded), None


def find_unfinished_placeholders(md_text: str, html_text: str) -> list[str]:
    visible_html = MD_SOURCE_RE.sub("", html_text)
    haystack = md_text + visible_html
    found = sorted(
        token for token in PLACEHOLDERS if token.lower() in haystack.lower()
    )
    found.extend(sorted(set(TEMPLATE_TOKEN_RE.findall(haystack))))
    return found


def check_local_links(html_path: Path, raw_html: str) -> list[str]:
    missing: list[str] = []
    for href in HREF_RE.findall(raw_html):
        if not href or href.startswith(
            (
                "#",
                "http://",
                "https://",
                "mailto:",
                "tel:",
                "javascript:",
                "data:",
                "blob:",
            )
        ):
            continue
        parsed = urlparse(href)
        target = (html_path.parent / unquote(parsed.path)).resolve()
        if not target.exists():
            missing.append(href)
    return sorted(set(missing))


def normalize_heading(value: str) -> str:
    value = re.sub(r"\s+#+\s*$", "", value.strip())
    return re.sub(r"[`*_~#\[\]()（）【】<>《》：:·|/\\\s]+", "", value.lower())


def company_v2_module_key(normalized_title: str) -> str | None:
    compact_title = re.sub(r"[^a-z0-9\u3400-\u9fff]+", "", normalized_title)
    for key, label in COMPANY_V2_MODULES:
        normalized_label = re.sub(
            r"[^a-z0-9\u3400-\u9fff]+",
            "",
            normalize_heading(label),
        )
        if compact_title == normalized_label or re.fullmatch(
            rf"(?:0?[1-5]|第[一二三四五](?:章|部分|篇)?){re.escape(normalized_label)}",
            compact_title,
        ):
            return key
    return None


def extract_sections(markdown: str) -> list[dict]:
    matches = list(HEADING_RE.finditer(markdown))
    sections: list[dict] = []
    current_h2: str | None = None
    for index, match in enumerate(matches):
        level = len(match.group(1))
        end = len(markdown)
        for next_match in matches[index + 1 :]:
            if len(next_match.group(1)) <= level:
                end = next_match.start()
                break
        title = re.sub(r"\s+#+\s*$", "", match.group(2)).strip()
        normalized_title = normalize_heading(title)
        if level <= 1:
            current_h2 = None
        parent_h2 = current_h2 if level > 2 else None
        if level == 2:
            current_h2 = normalized_title
        sections.append(
            {
                "title": title,
                "normalized_title": normalized_title,
                "level": level,
                "parent_h2": parent_h2,
                "start": match.start(),
                "end": end,
                "body": markdown[match.end() : end].strip(),
            }
        )
    return sections


def inspect_company_layout(sections: list[dict]) -> tuple[list[str], dict]:
    module_sections: dict[str, list[dict]] = {
        key: [] for key, _label in COMPANY_V2_MODULES
    }
    for section in sections:
        if section["level"] != 2:
            continue
        module_key = company_v2_module_key(section["normalized_title"])
        if module_key:
            module_sections[module_key].append(section)

    complete_v2 = all(module_sections.values())
    matched_modules = sum(bool(value) for value in module_sections.values())
    errors: list[str] = []
    leaf_count = 0
    if complete_v2:
        h2_count = sum(section["level"] == 2 for section in sections)
        if h2_count != len(COMPANY_V2_MODULES):
            errors.append(
                "company v2 报告必须恰好包含 5 个 H2，"
                f"当前 {h2_count} 个"
            )
        empty_modules: list[str] = []
        for key, label in COMPANY_V2_MODULES:
            parent_titles = {
                section["normalized_title"] for section in module_sections[key]
            }
            leaves = [
                section
                for section in sections
                if section["level"] == 3
                and section.get("parent_h2") in parent_titles
            ]
            leaf_count += len(leaves)
            if not leaves:
                empty_modules.append(label)
        if empty_modules:
            errors.append(
                "company v2 H2 模块缺少 H3 叶子章节："
                + ", ".join(empty_modules)
            )

    layout = "five-module-v2" if complete_v2 else (
        "hybrid" if matched_modules else "legacy-12"
    )
    return errors, {
        "company_layout": layout,
        "company_v2_modules": matched_modules,
        "company_v2_leaf_sections": leaf_count,
    }


def classify_company_sections(
    sections: list[dict],
    *,
    ignore_v2_containers: bool = False,
) -> dict[str, list[dict]]:
    classified = {key: [] for key, _label, _patterns in COMPANY_SECTION_RULES}
    for section in sections:
        if (
            ignore_v2_containers
            and section["level"] == 2
            and company_v2_module_key(section["normalized_title"])
        ):
            continue
        title = section["normalized_title"]
        for key, _label, patterns in COMPANY_SECTION_RULES:
            if any(re.search(pattern, title, re.I) for pattern in patterns):
                classified[key].append(section)
    return classified


def audit_mode_section_groups(
    mode: str,
    sections: list[dict],
    rules: tuple[tuple[str, tuple[str, ...]], ...],
) -> list[str]:
    normalized_titles = [section["normalized_title"] for section in sections]
    missing = [
        label
        for label, patterns in rules
        if not any(
            re.search(pattern, title, re.I)
            for title in normalized_titles
            for pattern in patterns
        )
    ]
    return [f"{mode} 报告缺少章节组：" + ", ".join(missing)] if missing else []


def merge_ranges(ranges: list[tuple[int, int]]) -> list[tuple[int, int]]:
    merged: list[list[int]] = []
    for start, end in sorted(ranges):
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [(start, end) for start, end in merged]


def text_without_ranges(text: str, ranges: list[tuple[int, int]]) -> str:
    chunks: list[str] = []
    cursor = 0
    for start, end in merge_ranges(ranges):
        chunks.append(text[cursor:start])
        cursor = end
    chunks.append(text[cursor:])
    return "".join(chunks)


def collect_source_definitions(source_text: str) -> dict[str, bool]:
    matches = list(SOURCE_ID_RE.finditer(source_text))
    definitions: dict[str, bool] = {}
    for index, match in enumerate(matches):
        source_id = match.group(1).upper()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source_text)
        block = source_text[match.start() : end]
        has_link = bool(
            HTTP_URL_RE.search(block) or LOCAL_MARKDOWN_LINK_RE.search(block)
        )
        definitions[source_id] = definitions.get(source_id, False) or has_link
    return definitions


def audit_source_ledger(
    md_text: str,
    source_sections: list[dict],
) -> tuple[list[str], list[str], dict]:
    errors: list[str] = []
    warnings: list[str] = []
    source_text = "\n".join(
        f"{section['title']}\n{section['body']}" for section in source_sections
    )
    definitions = collect_source_definitions(source_text)
    source_ranges = [(section["start"], section["end"]) for section in source_sections]
    report_body = FRONTMATTER_RE.sub(
        "",
        text_without_ranges(md_text, source_ranges),
        count=1,
    )
    used_ids = {source_id.upper() for source_id in SOURCE_ID_RE.findall(report_body)}
    defined_ids = set(definitions)

    if not definitions:
        errors.append("来源章节没有 [Sxx] 来源定义")

    undefined_ids = sorted(used_ids - defined_ids)
    if undefined_ids:
        errors.append("正文引用未在来源章节定义：" + ", ".join(undefined_ids))

    definitions_without_links = sorted(
        source_id for source_id, has_link in definitions.items() if not has_link
    )
    if definitions_without_links:
        errors.append(
            "来源定义缺少可点击 http(s) 或绝对本地链接："
            + ", ".join(definitions_without_links)
        )

    if definitions:
        missing_source_metadata = [
            label for label, pattern in SOURCE_METADATA_RULES if not pattern.search(source_text)
        ]
        if missing_source_metadata:
            errors.append(
                "来源章节缺少元数据列：" + ", ".join(missing_source_metadata)
            )

        source_rows: dict[str, list[str]] = {}
        for raw_line in source_text.splitlines():
            if "|" not in raw_line:
                continue
            cells = [cell.strip() for cell in raw_line.strip().strip("|").split("|")]
            if not cells:
                continue
            match = SOURCE_ID_RE.fullmatch(cells[0])
            if match:
                source_rows[match.group(1).upper()] = cells

        missing_rows = sorted(defined_ids - set(source_rows))
        if missing_rows:
            errors.append(
                "来源定义未使用结构化表格行：" + ", ".join(missing_rows)
            )
        for source_id, cells in sorted(source_rows.items()):
            if len(cells) < 6:
                errors.append(f"来源 {source_id} 的表格字段不足 6 列")
                continue
            labels = ("来源", "发布方/类型", "发布日期", "访问日期", "支持内容")
            blank_labels = [
                label
                for label, value in zip(labels, cells[1:6])
                if not value or value in {"-", "—"}
            ]
            if blank_labels:
                errors.append(
                    f"来源 {source_id} 元数据为空：" + ", ".join(blank_labels)
                )

    missing_local_targets: list[str] = []
    for raw_target in LOCAL_MARKDOWN_LINK_TARGET_RE.findall(source_text):
        target = Path(unquote(raw_target.strip()))
        if target.is_absolute() and not target.exists():
            missing_local_targets.append(str(target))
    if missing_local_targets:
        errors.append(
            "来源章节的绝对本地链接不存在："
            + ", ".join(sorted(set(missing_local_targets)))
        )

    unused_ids = sorted(defined_ids - used_ids)
    if unused_ids:
        warnings.append("来源章节存在未被正文引用的定义：" + ", ".join(unused_ids))

    return errors, warnings, {
        "source_ids_used": len(used_ids),
        "source_ids_defined": len(defined_ids),
    }


def normalize_market_status(value: str) -> str | None:
    normalized = re.sub(r"[\s_-]+", "", value.strip().lower())
    if normalized in {"private", "unlisted", "nonlisted", "非上市", "未上市", "私营"}:
        return "private"
    if normalized in {"listed", "public", "publiccompany", "上市", "上市公司"}:
        return "listed"
    if normalized in {"unknown", "unclear", "未知", "不确定", "待确认"}:
        return "unknown"
    if normalized in {"subsidiary", "子公司", "附属公司", "运营子公司"}:
        return "subsidiary"
    if normalized in {"institution", "机构", "投资机构", "基金", "非营利机构"}:
        return "institution"
    return None


def audit_company_report(
    md_text: str,
    frontmatter: dict[str, str],
    sections: list[dict],
    md_path: Path,
    allow_legacy_company: bool = False,
) -> tuple[list[str], list[str], dict]:
    errors: list[str] = []
    warnings: list[str] = []
    layout_errors, layout_checks = inspect_company_layout(sections)
    errors.extend(layout_errors)
    if (
        layout_checks["company_layout"] != "five-module-v2"
        and not allow_legacy_company
    ):
        errors.append(
            "strict company 报告必须使用 five-module-v2 五模块结构；"
            "审核历史旧稿时可显式使用 --allow-legacy-company"
        )
    classified = classify_company_sections(
        sections,
        ignore_v2_containers=layout_checks["company_layout"] == "five-module-v2",
    )

    missing_groups = [
        label
        for key, label, _patterns in COMPANY_SECTION_RULES
        if not classified[key]
    ]
    if missing_groups:
        errors.append("company 报告缺少章节组：" + ", ".join(missing_groups))

    missing_core_evidence: list[str] = []
    for key, label in COMPANY_CORE_SECTIONS:
        if not classified[key]:
            continue
        section_text = "\n".join(section["body"] for section in classified[key])
        if not SOURCE_ID_RE.search(section_text) and not GAP_DISCLOSURE_RE.search(section_text):
            missing_core_evidence.append(label)
    if missing_core_evidence:
        errors.append(
            "company 核心章节缺少来源 ID 或缺口说明："
            + ", ".join(missing_core_evidence)
        )

    source_sections = classified["sources"]
    if layout_checks["company_layout"] == "five-module-v2":
        company_visible_body = "\n".join(
            f"{section['title']}\n{section['body']}"
            for section in sections
            if section["level"] == 2
            and company_v2_module_key(section["normalized_title"])
            != "sources_gaps"
        )
    else:
        source_ranges = [
            (section["start"], section["end"]) for section in source_sections
        ]
        company_visible_body = FRONTMATTER_RE.sub(
            "",
            text_without_ranges(md_text, source_ranges),
            count=1,
        )
    company_body_emojis = sorted(
        set(VISIBLE_EMOJI_RE.findall(company_visible_body))
    )
    if company_body_emojis:
        errors.append(
            "company Markdown 正文禁止 emoji："
            + " ".join(company_body_emojis[:10])
        )

    source_errors, source_warnings, source_checks = audit_source_ledger(
        md_text,
        source_sections,
    )
    errors.extend(source_errors)
    warnings.extend(source_warnings)

    market_status = normalize_market_status(frontmatter.get("market_status", ""))
    if frontmatter.get("market_status") and market_status is None:
        errors.append(
            "market_status 需明确为 listed、private、subsidiary、institution 或 unknown"
        )

    finance_text = "\n".join(
        section["body"] for section in classified["finance_capital"]
    )
    if finance_text and market_status == "listed":
        missing_basis: list[str] = []
        if not LISTED_PERIOD_RE.search(finance_text):
            missing_basis.append("报告期/财年")
        if not LISTED_CURRENCY_RE.search(finance_text):
            missing_basis.append("币种")
        if not LISTED_UNIT_RE.search(finance_text):
            missing_basis.append("单位")
        if not LISTED_SCOPE_RE.search(finance_text):
            missing_basis.append("合并/单体口径")
        if missing_basis:
            errors.append("上市公司财务章节缺少口径：" + ", ".join(missing_basis))
        missing_metrics = [
            label for label, pattern in LISTED_METRIC_RULES if not pattern.search(finance_text)
        ]
        if missing_metrics:
            errors.append(
                "上市公司财务章节缺少核心指标或缺口说明："
                + ", ".join(missing_metrics)
            )
    elif finance_text and market_status in {"private", "unknown"}:
        if not (
            PRIVATE_FINANCE_LIMIT_RE.search(finance_text)
            or PRIVATE_DISCLOSED_FINANCE_RE.search(finance_text)
        ):
            errors.append(
                "private/unknown 公司财务章节既无公开财务局限说明，也无正式财务披露依据"
            )
    elif finance_text and market_status == "subsidiary":
        separates_scopes = bool(
            SUBSIDIARY_TARGET_SCOPE_RE.search(finance_text)
            and SUBSIDIARY_PARENT_SCOPE_RE.search(finance_text)
        )
        if not separates_scopes and not SUBSIDIARY_LIMIT_RE.search(finance_text):
            errors.append("subsidiary 财务章节未区分目标子公司与母公司/集团口径")
    elif finance_text and market_status == "institution":
        if not (
            INSTITUTION_FINANCE_RE.search(finance_text)
            or GAP_DISCLOSURE_RE.search(finance_text)
        ):
            errors.append("institution 财务章节未说明适用的资金口径或公开信息缺口")

    return errors, warnings, {
        "company_section_groups": sum(bool(value) for value in classified.values()),
        **layout_checks,
        "company_body_emojis": len(company_body_emojis),
        **source_checks,
        "market_status": market_status,
    }


def audit_texts(
    md_text: str,
    html_text: str,
    md_path: Path,
    html_path: Path,
    strict: bool,
    allow_legacy_company: bool = False,
) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    md_text = normalize_text(md_text)
    html_text = normalize_text(html_text)

    if md_path.stem != html_path.stem:
        errors.append("MD 与 HTML 文件名 stem 不一致")

    md_file_version = extract_version(md_path)
    html_file_version = extract_version(html_path)
    if md_file_version != html_file_version:
        errors.append("MD 与 HTML 文件名版本不一致")
    if strict and not md_file_version:
        errors.append("文件名缺少 _vN 版本后缀")

    frontmatter = parse_frontmatter(md_text)
    mode = frontmatter.get("mode", "").strip().lower()
    depth = frontmatter.get("depth", "").strip().lower()
    required_frontmatter = list(REQUIRED_FRONTMATTER)
    if strict and mode == "company":
        required_frontmatter.extend(COMPANY_REQUIRED_FRONTMATTER)
    missing_frontmatter = [
        key for key in required_frontmatter if not frontmatter.get(key)
    ]
    if strict and missing_frontmatter:
        errors.append("frontmatter 缺字段：" + ", ".join(missing_frontmatter))
    if strict and mode not in VALID_MODES:
        errors.append("mode 需明确为 company、client 或 investor")
    if strict and mode == "company" and depth not in VALID_DEPTHS:
        errors.append("company depth 需明确为 quick、standard 或 deep")
    elif strict and depth and depth not in VALID_DEPTHS:
        errors.append("depth 需明确为 quick、standard 或 deep")

    declared_version = frontmatter.get("version", "").lower()
    if md_file_version and declared_version and declared_version != md_file_version:
        errors.append(
            f"frontmatter version={declared_version} 与文件名版本={md_file_version} 不一致"
        )

    embedded_md, decode_error = decode_embedded_markdown(html_text)
    if decode_error:
        errors.append(decode_error)
    elif embedded_md != md_text:
        errors.append("HTML 内嵌 Markdown 与磁盘 MD 内容不一致")

    found_placeholders = find_unfinished_placeholders(md_text, html_text)
    if found_placeholders:
        errors.append("存在模板占位符：" + ", ".join(found_placeholders))
    if strict and BROKEN_STRONG_LABEL_RE.search(md_text):
        errors.append("粗体标签结束后缺少空格，部分 Markdown 渲染器会显示裸露 **")

    design_errors, design_checks = audit_html_design_contract(html_text)
    errors.extend(design_errors)

    compact_html = re.sub(r"\s+", "", html_text)
    if "startOnLoad:true" in compact_html:
        errors.append("Mermaid 仍使用 startOnLoad:true")
    if "securityLevel:'loose'" in compact_html or 'securityLevel:"loose"' in compact_html:
        errors.append("Mermaid 仍使用 securityLevel:loose")
    if "htmlLabels:true" in compact_html:
        errors.append("Mermaid 仍允许 htmlLabels:true")
    if "markdownit({html:true" in compact_html:
        errors.append("Markdown 渲染器仍允许原始 HTML")
    has_mermaid_support = "mermaid" in html_text.lower()
    if has_mermaid_support and "renderAllMermaid" not in html_text:
        errors.append("缺少显式 renderAllMermaid")
    if has_mermaid_support and "dataset.renderStatus" not in html_text:
        errors.append("缺少 Mermaid data-render-status 状态写入")

    sections = extract_sections(md_text)
    headings = [section["title"] for section in sections]
    company_checks: dict = {}
    if strict and mode == "company":
        company_errors, company_warnings, company_checks = audit_company_report(
            md_text,
            frontmatter,
            sections,
            md_path,
            allow_legacy_company,
        )
        errors.extend(company_errors)
        warnings.extend(company_warnings)
    elif strict and mode == "client":
        errors.extend(audit_mode_section_groups(mode, sections, CLIENT_SECTION_RULES))
    elif strict and mode == "investor":
        errors.extend(audit_mode_section_groups(mode, sections, INVESTOR_SECTION_RULES))

    if strict and mode in {"client", "investor"}:
        source_sections = [
            section
            for section in sections
            if re.search(
                r"来源|参考资料|参考文献|资料出处|信源|引用资料|证据清单",
                section["normalized_title"],
                re.I,
            )
        ]
        source_errors, source_warnings, source_checks = audit_source_ledger(
            md_text,
            source_sections,
        )
        errors.extend(source_errors)
        warnings.extend(source_warnings)
        company_checks.update(source_checks)

    if strict:
        has_legacy_evidence = any(marker in md_text for marker in EVIDENCE_MARKERS)
        has_company_evidence = bool(
            GAP_DISCLOSURE_RE.search(md_text)
            or COMPANY_EVIDENCE_LANGUAGE_RE.search(md_text)
        )
        if not has_legacy_evidence and not (
            mode in VALID_MODES and has_company_evidence
        ):
            errors.append("未发现事实、自述、推断或信息缺口的证据语言")

    missing_links = check_local_links(html_path, html_text)
    if missing_links:
        warnings.append(
            f"本地链接不存在 {len(missing_links)} 个：" + ", ".join(missing_links[:10])
        )

    if re.search(r"Syntax error in text|mermaid version\s+\d", html_text, re.I):
        errors.append("HTML 中存在 Mermaid 错误文本")

    return {
        "files": {"markdown": str(md_path), "html": str(html_path)},
        "passed": not errors,
        "checks": {
            "same_stem": md_path.stem == html_path.stem,
            "file_version": md_file_version,
            "declared_version": declared_version or None,
            "embedded_markdown_matches": embedded_md == md_text if embedded_md is not None else False,
            **design_checks,
            "headings": len(headings),
            "evidence_markers": sum(md_text.count(marker) for marker in EVIDENCE_MARKERS),
            "mode": mode or None,
            **company_checks,
        },
        "errors": errors,
        "warnings": warnings,
    }


def audit_files(
    md_path: Path,
    html_path: Path,
    strict: bool,
    allow_legacy_company: bool = False,
) -> dict:
    errors: list[str] = []
    if not md_path.is_file():
        errors.append(f"Markdown 不存在：{md_path}")
    if not html_path.is_file():
        errors.append(f"HTML 不存在：{html_path}")
    if errors:
        return {
            "files": {"markdown": str(md_path), "html": str(html_path)},
            "passed": False,
            "checks": {},
            "errors": errors,
            "warnings": [],
        }
    return audit_texts(
        md_path.read_text(encoding="utf-8-sig"),
        html_path.read_text(encoding="utf-8-sig"),
        md_path,
        html_path,
        strict,
        allow_legacy_company,
    )


def build_markdown_audit_shell(markdown: str) -> str:
    payload = base64.b64encode(markdown.encode("utf-8")).decode("ascii")
    return f"""<!doctype html>
<html lang="zh-CN" data-design-system="company-research-v2">
<head><style>
@media (prefers-reduced-motion: reduce){{*{{scroll-behavior:auto!important;transition:none!important}}}}
@media print{{nav,.skip-link{{display:none!important}}}}
</style></head><body>
<a class="skip-link" href="#report-content">跳到报告正文</a>
<nav id="view-nav" data-view-nav>
  <a data-view-link="business" href="#business-report">业务视角</a>
  <a data-view-link="technology" href="#technology-report">技术视角</a>
</nav>
<main id="report-content">
  <section id="business-report" data-view-panel="business">
    <h2><button aria-expanded="true" aria-controls="business-report-body">业务报告</button></h2>
    <div id="business-report-body"></div>
  </section>
  <section id="technology-report" data-view-panel="technology">
    <h2><button aria-expanded="true" aria-controls="technology-report-body">技术报告</button></h2>
    <div id="technology-report-body"></div>
  </section>
</main>
<script id="md-source" type="text/plain">{payload}</script>
<script>
function renderAllMermaid(){{
  mermaid.initialize({{startOnLoad:false,securityLevel:'strict',flowchart:{{htmlLabels:false}}}});
  block.dataset.renderStatus='ok';
}}
</script></body></html>"""


def audit_markdown_file(
    md_path: Path,
    strict: bool,
    allow_legacy_company: bool = False,
) -> dict:
    if not md_path.is_file():
        return {
            "files": {"markdown": str(md_path), "html": None},
            "passed": False,
            "checks": {"markdown_only": True},
            "errors": [f"Markdown 不存在：{md_path}"],
            "warnings": [],
        }
    md_text = normalize_text(md_path.read_text(encoding="utf-8-sig"))
    report = audit_texts(
        md_text,
        build_markdown_audit_shell(md_text),
        md_path,
        md_path.with_suffix(".html"),
        strict,
        allow_legacy_company,
    )
    report["files"]["html"] = None
    report["checks"]["markdown_only"] = True
    return report


def self_test() -> int:
    client_markdown = """---
title: 测试公司 · 拜访作战地图
report_id: test-company-client
subject: 测试公司有限公司
mode: client
version: v1
as_of: 2026-07-28
generated_at: 2026-07-28
---
# 执行摘要
[L1·官方] 测试事实。
## 公司主体与当前业务
已查证：测试公司提供企业软件服务。[S01]
## 机会背景与真实需求
客户需要核实当前采购问题和验收目标。
## 决策链与关键人
业务负责人、技术评估者与采购共同参与。
## 我方方案切入与最小验证
先用小范围验证确认价值与边界。
## 双向问题
- 对方可能问：如何验收？
- 我方主动问：谁最终拍板？
## 会议议程与后续动作
先确认目标，再演示并约定下一步。
## 来源
| ID | 来源 | 发布方/类型 | 发布日期 | 访问日期 | 支持内容 |
|---|---|---|---|---|---|
| [S01] | [官方网站](https://example.com/client) | 公司官网 | 2026-09-01 | 2026-09-04 | 主体与业务 |
## 风险与待确认项
- 商业化规模
"""
    investor_markdown = """---
title: 测试基金 · 拜访作战地图
report_id: test-fund-investor
subject: 测试基金管理有限公司
mode: investor
version: v1
as_of: 2026-09-04
generated_at: 2026-09-04
---
# 执行摘要
已查证：测试机构管理一只企业服务基金。
## 机构与基金主体
管理主体与基金名称已区分。[S01]
## 投资主题与出手节奏
重点关注早期企业软件项目。
## 近期案例与投资组合
近期案例和组合冲突仍需核实。
## 决策合伙人与投决流程
项目须经合伙人会议决策。
## 我方项目匹配与差异化
匹配点与反对面均已列出。
## 双向问题与下一步
现场确认票面、节奏与下一步材料。
## 来源
| ID | 来源 | 发布方/类型 | 发布日期 | 访问日期 | 支持内容 |
|---|---|---|---|---|---|
| [S01] | [机构官网](https://example.com/investor) | 机构官网 | 2026-09-01 | 2026-09-04 | 主体与基金 |
## 风险与待确认
- 基金已缴规模待确认。
"""
    def make_html(markdown: str) -> str:
        return build_markdown_audit_shell(markdown)

    def run(
        markdown: str,
        stem: str = "公司调研报告_v1",
        html_override: str | None = None,
        allow_legacy_company: bool = False,
    ) -> dict:
        return audit_texts(
            markdown,
            html_override if html_override is not None else make_html(markdown),
            Path(f"/tmp/{stem}.md"),
            Path(f"/tmp/{stem}.html"),
            True,
            allow_legacy_company,
        )

    def expect_pass(name: str, report: dict) -> bool:
        if report["passed"]:
            return True
        print(f"self-test failed: {name} should pass", file=sys.stderr)
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return False

    def expect_fail(name: str, report: dict, expected: str) -> bool:
        if not report["passed"] and any(expected in error for error in report["errors"]):
            return True
        print(
            f"self-test failed: {name} should fail with {expected!r}",
            file=sys.stderr,
        )
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return False

    if find_unfinished_placeholders(
        "# 已完成报告\n",
        '<script id="md-source" type="text/plain">TBD</script>',
    ):
        print("self-test failed: encoded payload must not be scanned as visible text", file=sys.stderr)
        return 1
    encoded_design_errors, _encoded_design_checks = audit_html_design_contract(
        build_markdown_audit_shell(
            "# 公司🚀\n技术说明：linear-gradient(...) 与 box-shadow:\n"
        )
    )
    if encoded_design_errors:
        print(
            "self-test failed: #md-source payload must be excluded from visual gates",
            file=sys.stderr,
        )
        print(
            json.dumps(encoded_design_errors, ensure_ascii=False, indent=2),
            file=sys.stderr,
        )
        return 1

    private_quick = """---
title: 测试私企 · 公司调研报告
report_id: test-private-company
subject: 测试私企有限公司
mode: company
version: v1
as_of: 2026-09-04
generated_at: 2026-09-04
depth: quick
market_status: private
---
# 一句话结论
[L1·官方] 该公司提供企业软件服务。[S01]
## 主体核验与调研范围
本报告覆盖测试私企有限公司及其官网所示产品，核实截至 2026-09-04。[S01]
## 业务与产品
主营企业软件订阅产品。[S01]
## 技术与研发
官网披露采用云原生架构。[S02]
## 财务与资本
该主体为非上市公司，公开渠道未见经审计财务报表；收入、利润和现金流无法确认。
## 商业化与客户
官网披露按年订阅并服务企业客户。[S01]
## 竞争格局与替代方案
替代方案包括客户自建及通用协作软件。[S02]
## 近期变化
官网称 2026 年更新了企业软件产品。[S01]
## 风险与反对证据
客户数量和续费率尚无独立公开证据。
## 结论与下一步
据此判断，可继续核实客户留存与财务资料。[S01]
## 来源
| ID | 来源 | 发布方/类型 | 发布日期 | 访问日期 | 支持内容 |
|---|---|---|---|---|---|
| [S01] | [公司官网业务页](https://example.com/business) | 公司官网 | 2026-09-01 | 2026-09-04 | 业务与商业化 |
| [S02] | [公司官网技术页](https://example.com/technology) | 公司官网 | 2026-09-01 | 2026-09-04 | 技术与竞争 |
## 信息缺口与待确认
- 收入规模、客户数量与续费率待确认。
"""

    five_module_company = """---
title: 测试新版私企 · 公司调研报告
report_id: test-v2-private-company
subject: 测试新版私企有限公司
mode: company
version: v1
as_of: 2026-09-08
generated_at: 2026-09-08
depth: quick
market_status: private
---
# 测试新版私企公司调研
## 公司总览
### 结论先行
公司称其为企业客户提供订阅软件。[S01]
### 主体核验与调研范围
本报告覆盖测试新版私企有限公司及其官网所示产品。[S01]
### 近期变化
官网称 2026 年更新了核心产品。[S01]
### 决策结论与下一步
据此判断，应继续核实客户留存与财务资料。[S01]
## 业务报告
### 业务与产品
主营企业软件订阅产品。[S01]
### 商业化与客户
官网披露按年订阅并服务企业客户。[S01]
### 竞争格局与替代方案
替代方案包括客户自建及通用协作软件。[S02]
## 技术报告
### 技术与研发
官网披露采用云原生架构。[S02]
## 财务商业质量与风险
### 财务与资本
该主体为非上市公司，公开渠道未见经审计财务报表；收入、利润和现金流无法确认。
### 风险与反对证据
客户数量和续费率尚无独立公开证据。
## 来源与信息缺口
### 来源
| ID | 来源 | 发布方/类型 | 发布日期 | 访问日期 | 支持内容 |
|---|---|---|---|---|---|
| [S01] | [公司官网业务页](https://example.com/business) | 公司官网 | 2026-09-01 | 2026-09-08 | 主体、业务与商业化 |
| [S02] | [公司官网技术页](https://example.com/technology) | 公司官网 | 2026-09-01 | 2026-09-08 | 技术与竞争 |
### 信息缺口与待确认
- 收入规模、客户数量与续费率待确认。
"""

    listed_company = """---
title: 测试上市公司 · 公司调研报告
report_id: test-listed-company
subject: 测试上市股份有限公司
mode: company
version: v1
as_of: 2026-09-04
generated_at: 2026-09-04
depth: deep
market_status: listed
---
# 核心判断
已查证：该公司同时经营软件和技术服务。[S01]
## 公司主体及研究边界
研究主体为测试上市股份有限公司，范围不含联营公司。[S01]
## 产品和业务矩阵
收入来自软件许可与技术服务。[S01]
## 研发与核心技术
公司披露持续投入研发平台。[S02]
## 资本与经营数据
2025 财年（报告期：2025-01-01 至 2025-12-31），币种为人民币，单位为百万元，采用合并口径；年报披露营业收入、利润、经营现金流、研发投入和分部收入结构。[S03]
## 客户及商业模式
公司通过许可费和服务费向企业客户收费。[S01]
## 竞品、竞争及替代
竞争来自行业软件厂商与客户自建系统。[S02]
## 近期变化
年报显示公司继续投入研发平台。[S02]
## 主要风险和反方证据
服务收入增长不能单独证明订阅收入改善。[S03]
## 结论与下一步
据此判断，应继续核实订阅留存与现金流质量。[S03]
## 参考资料
| ID | 来源 | 发布方/类型 | 发布日期 | 访问日期 | 支持内容 |
|---|---|---|---|---|---|
| [S01] | [2025 年年度报告业务章节](https://example.com/annual-report-business) | 交易所年报 | 2026-03-01 | 2026-09-04 | 业务与商业化 |
| [S02] | [研发平台官方说明](https://example.com/research) | 公司技术文档 | 2026-08-01 | 2026-09-04 | 技术与竞争 |
| [S03] | [2025 年年度报告财务章节](https://example.com/annual-report-finance) | 交易所年报 | 2026-03-01 | 2026-09-04 | 财务与风险 |
## 信息缺口和待核实
- 分部客户留存率未披露。
"""

    missing_sections = """---
title: 缺章节公司 · 公司调研报告
report_id: test-missing-sections
subject: 缺章节公司有限公司
mode: company
version: v1
as_of: 2026-09-04
generated_at: 2026-09-04
depth: quick
market_status: unknown
---
# 一句话结论
[L1] 仅能确认一项业务。[S01]
## 当前业务
提供测试服务。[S01]
## 来源
- [S01] [官网](https://example.com)
## 待确认项
- 其余维度均待确认。
"""

    undefined_source = private_quick.replace(
        "官网披露采用云原生架构。[S02]",
        "官网披露采用云原生架构。[S99]",
    )
    listed_missing_basis = listed_company.replace(
        "2025 财年（报告期：2025-01-01 至 2025-12-31），币种为人民币，单位为百万元，采用合并口径；年报披露营业收入、利润、经营现金流、研发投入和分部收入结构。[S03]",
        "年度报告披露营业收入增长。[S03]",
    )
    natural_company_language = private_quick.replace(
        "[L1·官方] 该公司提供企业软件服务。[S01]",
        "官网称该公司提供企业软件服务。[S01]",
    ).replace("已查证：", "年报显示：")
    invalid_mode = private_quick.replace("mode: company", "mode: compnay")
    invalid_depth = private_quick.replace("depth: quick", "depth: banana")
    listed_single_scope = listed_company.replace(
        "采用合并口径",
        "采用单体报表口径",
    )
    private_with_disclosed_finance = private_quick.replace(
        "该主体为非上市公司，公开渠道未见经审计财务报表；收入、利润和现金流无法确认。",
        "该主体为非上市公司；公开发债募集说明书披露经审计财务报表，报告期为 2025 财年。[S01]",
    )
    subsidiary_scope = private_quick.replace(
        "market_status: private",
        "market_status: subsidiary",
    ).replace(
        "该主体为非上市公司，公开渠道未见经审计财务报表；收入、利润和现金流无法确认。",
        "母公司仅披露集团合并报表，无法拆分目标子公司自身收入、利润和现金流。[S01]",
    )
    institution_scope = private_quick.replace(
        "market_status: private",
        "market_status: institution",
    ).replace(
        "该主体为非上市公司，公开渠道未见经审计财务报表；收入、利润和现金流无法确认。",
        "公开资料披露基金规模与投资节奏，但未披露管理资产 AUM 的审计口径。[S01]",
    )
    subsidiary_scope_missing = private_quick.replace(
        "market_status: private",
        "market_status: subsidiary",
    ).replace(
        "该主体为非上市公司，公开渠道未见经审计财务报表；收入、利润和现金流无法确认。",
        "集团披露 2025 年收入增长。[S01]",
    )
    missing_source_metadata = private_quick.replace(
        "| ID | 来源 | 发布方/类型 | 发布日期 | 访问日期 | 支持内容 |",
        "| ID | 来源 |",
    )
    blank_source_row_metadata = private_quick.replace(
        "| [S01] | [公司官网业务页](https://example.com/business) | 公司官网 | 2026-09-01 | 2026-09-04 | 业务与商业化 |",
        "| [S01] | [公司官网业务页](https://example.com/business) |  |  |  |  |",
    )
    missing_local_source = private_quick.replace(
        "https://example.com/business",
        "/definitely/missing/customer-research-source.md",
    )
    broken_strong_label = private_quick.replace(
        "主营企业软件订阅产品。[S01]",
        "**核心业务：**主营企业软件订阅产品。[S01]",
    )
    v2_empty_technology_module = five_module_company.replace(
        "## 技术报告\n### 技术与研发\n官网披露采用云原生架构。[S02]",
        "## 技术报告\n官网披露采用云原生架构。[S02]",
    )
    v2_extra_h2 = five_module_company.replace(
        "## 来源与信息缺口",
        "## 附加说明\n### 口径说明\n补充说明不应成为额外 H2。\n## 来源与信息缺口",
        1,
    )
    v2_body_emoji = five_module_company.replace(
        "主营企业软件订阅产品。[S01]",
        "🚀 主营企业软件订阅产品。[S01]",
        1,
    )
    v2_source_title_emoji = five_module_company.replace(
        "[公司官网业务页](https://example.com/business)",
        "[🚀 公司官网业务页](https://example.com/business)",
        1,
    )

    valid_contract_html = make_html(private_quick)
    missing_design_marker_html = valid_contract_html.replace(
        ' data-design-system="company-research-v2"',
        "",
        1,
    )
    missing_skip_link_html = valid_contract_html.replace(
        'class="skip-link"',
        'class="skip-link-disabled"',
        1,
    )
    missing_view_nav_html = valid_contract_html.replace(
        " data-view-nav",
        "",
        1,
    )
    missing_business_link_html = valid_contract_html.replace(
        'data-view-link="business"',
        'data-view-link="business-disabled"',
        1,
    )
    missing_technology_panel_html = valid_contract_html.replace(
        'data-view-panel="technology"',
        'data-view-panel="technology-disabled"',
        1,
    )
    missing_collapse_button_html = valid_contract_html.replace(
        ' aria-expanded="true"',
        "",
    )
    missing_reduced_motion_html = valid_contract_html.replace(
        "prefers-reduced-motion: reduce",
        "prefers-reduced-motion: no-preference",
        1,
    )
    missing_print_css_html = valid_contract_html.replace(
        "@media print",
        "@media screen",
        1,
    )
    legacy_visual_html = valid_contract_html.replace(
        "</body>",
        '<div class="theme-sw orb"></div></body>',
        1,
    )
    linear_gradient_html = valid_contract_html.replace(
        "</style>",
        "body{background:linear-gradient(90deg,#fff,#000)}\n</style>",
        1,
    )
    box_shadow_html = valid_contract_html.replace(
        "</style>",
        ".report-card{box-shadow:0 8px 24px rgba(0,0,0,.2)}\n</style>",
        1,
    )
    visible_emoji_html = valid_contract_html.replace(
        "跳到报告正文",
        "🚀 跳到报告正文",
        1,
    )
    comment_and_note_only_html = valid_contract_html.replace(
        "</style>",
        "/* 技术说明：不得使用 linear-gradient(...) 或 box-shadow: */\n</style>",
        1,
    ).replace(
        '<main id="report-content">',
        '<!-- 🚀 仅为模板注释 -->'
        '<p>技术说明：linear-gradient(...) 和 box-shadow: 均为禁用词示例。</p>'
        '<main id="report-content">',
        1,
    )

    checks = (
        expect_pass("legacy client", run(client_markdown, "拜访作战地图_v1")),
        expect_pass("investor extension", run(investor_markdown, "投资人作战地图_v1")),
        expect_fail(
            "default legacy company rejected",
            run(private_quick),
            "five-module-v2",
        ),
        expect_pass(
            "legacy company explicit compatibility",
            run(private_quick, allow_legacy_company=True),
        ),
        expect_pass("valid five-module company", run(five_module_company)),
        expect_pass(
            "official source title emoji exemption",
            run(v2_source_title_emoji),
        ),
        expect_fail(
            "company Markdown body emoji",
            run(v2_body_emoji),
            "company Markdown 正文禁止 emoji",
        ),
        expect_pass(
            "natural company evidence language",
            run(natural_company_language, allow_legacy_company=True),
        ),
        expect_pass(
            "valid listed company",
            run(listed_company, allow_legacy_company=True),
        ),
        expect_pass(
            "listed single-entity scope",
            run(listed_single_scope, allow_legacy_company=True),
        ),
        expect_pass(
            "private disclosed finance",
            run(private_with_disclosed_finance, allow_legacy_company=True),
        ),
        expect_pass(
            "subsidiary scope",
            run(subsidiary_scope, allow_legacy_company=True),
        ),
        expect_pass(
            "institution scope",
            run(institution_scope, allow_legacy_company=True),
        ),
        expect_fail("invalid mode", run(invalid_mode), "mode 需明确"),
        expect_fail(
            "invalid depth",
            run(invalid_depth, allow_legacy_company=True),
            "company depth 需明确",
        ),
        expect_fail(
            "subsidiary scope missing",
            run(subsidiary_scope_missing, allow_legacy_company=True),
            "subsidiary 财务章节未区分",
        ),
        expect_fail(
            "missing company sections",
            run(missing_sections, allow_legacy_company=True),
            "company 报告缺少章节组",
        ),
        expect_fail(
            "undefined source id",
            run(undefined_source, allow_legacy_company=True),
            "正文引用未在来源章节定义",
        ),
        expect_fail(
            "listed financial basis",
            run(listed_missing_basis, allow_legacy_company=True),
            "上市公司财务章节缺少口径",
        ),
        expect_fail(
            "missing source metadata",
            run(missing_source_metadata, allow_legacy_company=True),
            "来源章节缺少元数据列",
        ),
        expect_fail(
            "blank source row metadata",
            run(blank_source_row_metadata, allow_legacy_company=True),
            "来源 S01 元数据为空",
        ),
        expect_fail(
            "missing local source",
            run(missing_local_source, allow_legacy_company=True),
            "绝对本地链接不存在",
        ),
        expect_fail(
            "broken strong label",
            run(broken_strong_label, allow_legacy_company=True),
            "粗体标签结束后缺少空格",
        ),
        expect_fail(
            "five-module H3 leaves",
            run(v2_empty_technology_module),
            "company v2 H2 模块缺少 H3 叶子章节",
        ),
        expect_fail(
            "five-module extra H2",
            run(v2_extra_h2),
            "company v2 报告必须恰好包含 5 个 H2",
        ),
        expect_fail(
            "missing design marker",
            run(
                private_quick,
                html_override=missing_design_marker_html,
                allow_legacy_company=True,
            ),
            'data-design-system="company-research-v2"',
        ),
        expect_fail(
            "missing skip link",
            run(
                private_quick,
                html_override=missing_skip_link_html,
                allow_legacy_company=True,
            ),
            ".skip-link",
        ),
        expect_fail(
            "missing view nav",
            run(
                private_quick,
                html_override=missing_view_nav_html,
                allow_legacy_company=True,
            ),
            "nav#view-nav[data-view-nav]",
        ),
        expect_fail(
            "missing business view link",
            run(
                private_quick,
                html_override=missing_business_link_html,
                allow_legacy_company=True,
            ),
            "business 锚点",
        ),
        expect_fail(
            "missing technology panel",
            run(
                private_quick,
                html_override=missing_technology_panel_html,
                allow_legacy_company=True,
            ),
            "section#technology-report",
        ),
        expect_fail(
            "missing semantic collapse",
            run(
                private_quick,
                html_override=missing_collapse_button_html,
                allow_legacy_company=True,
            ),
            "button[aria-expanded]",
        ),
        expect_fail(
            "missing reduced motion",
            run(
                private_quick,
                html_override=missing_reduced_motion_html,
                allow_legacy_company=True,
            ),
            "prefers-reduced-motion: reduce",
        ),
        expect_fail(
            "missing print CSS",
            run(
                private_quick,
                html_override=missing_print_css_html,
                allow_legacy_company=True,
            ),
            "@media print",
        ),
        expect_fail(
            "legacy visual components",
            run(
                private_quick,
                html_override=legacy_visual_html,
                allow_legacy_company=True,
            ),
            "废弃的旧视觉组件",
        ),
        expect_fail(
            "linear gradient regression",
            run(
                private_quick,
                html_override=linear_gradient_html,
                allow_legacy_company=True,
            ),
            "linear-gradient",
        ),
        expect_fail(
            "box shadow regression",
            run(
                private_quick,
                html_override=box_shadow_html,
                allow_legacy_company=True,
            ),
            "box-shadow",
        ),
        expect_fail(
            "visible emoji regression",
            run(
                private_quick,
                html_override=visible_emoji_html,
                allow_legacy_company=True,
            ),
            "可见模板禁止 emoji",
        ),
        expect_pass(
            "comments and visible technical notes do not trigger visual gate",
            run(
                private_quick,
                html_override=comment_and_note_only_html,
                allow_legacy_company=True,
            ),
        ),
    )

    mismatch = audit_texts(
        client_markdown + "\n冲突内容",
        make_html(client_markdown),
        Path("/tmp/公司作战地图_v1.md"),
        Path("/tmp/公司作战地图_v2.html"),
        True,
    )
    checks += (
        expect_fail("legacy mismatch", mismatch, "文件名版本不一致"),
    )
    with tempfile.TemporaryDirectory(prefix="customer-research-pipeline-") as temp_dir:
        from build_report_html import build_report_html

        pipeline_md = Path(temp_dir) / "测试私企_公司调研_v1.md"
        pipeline_md.write_text(private_quick, encoding="utf-8")
        pipeline_html = build_report_html(pipeline_md)
        checks += (
            expect_pass(
                "real builder to auditor pipeline",
                audit_files(
                    pipeline_md,
                    pipeline_html,
                    True,
                    allow_legacy_company=True,
                ),
            ),
            expect_pass(
                "markdown-only pipeline",
                audit_markdown_file(
                    pipeline_md,
                    True,
                    allow_legacy_company=True,
                ),
            ),
        )
    if not all(checks):
        return 1
    print("self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit customer-research Markdown + HTML delivery pair."
    )
    parser.add_argument("markdown", type=Path, nargs="?")
    parser.add_argument("html", type=Path, nargs="?")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument(
        "--markdown-only",
        action="store_true",
        help="audit one Markdown report without requiring an HTML deliverable",
    )
    parser.add_argument(
        "--allow-legacy-company",
        action="store_true",
        help=(
            "allow a legacy company section layout in strict mode; "
            "all non-layout quality gates remain enabled"
        ),
    )
    parser.add_argument("--json-out", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if not args.markdown:
        parser.error("markdown is required unless --self-test is used")
    if args.markdown_only and args.html:
        parser.error("do not pass an HTML path with --markdown-only")
    if not args.markdown_only and not args.html:
        parser.error("html is required unless --self-test or --markdown-only is used")

    if args.markdown_only:
        report = audit_markdown_file(
            args.markdown.resolve(),
            args.strict,
            args.allow_legacy_company,
        )
    else:
        report = audit_files(
            args.markdown.resolve(),
            args.html.resolve(),
            args.strict,
            args.allow_legacy_company,
        )
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.json_out:
        args.json_out.write_text(rendered + "\n", encoding="utf-8")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
