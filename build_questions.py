from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent
DOCX = ROOT / "5.29《习近平新时代中国特色社会主义思想概论》题库2023版 (1).docx"
OUT = ROOT / "questions.js"

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
SECTION_RE = re.compile(r"^[一二三]、")
QUESTION_RE = re.compile(r"^(\d+)[\.．、]\s*(.+)")
OPTION_RE = re.compile(r"^([A-F])(?:[\.\．、]\s*)?(.+)")
ANSWER_RE = re.compile(r"[（(]([A-F]{1,6}|√|×)[）)]")
SOURCE_RE = re.compile(r"【([^】]+)】")


def extract_lines(docx_path: Path) -> list[str]:
    with ZipFile(docx_path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))

    lines: list[str] = []
    for para in root.findall(".//w:body/w:p", NS):
        parts: list[str] = []
        for node in para.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag == "t" and node.text:
                parts.append(node.text)
            elif tag == "tab":
                parts.append("\t")
            elif tag == "br":
                parts.append("\n")
        text = re.sub(r"\s+", " ", "".join(parts)).strip()
        if text:
            lines.append(text)
    return lines


def current_section(line: str, section: str | None) -> str | None:
    if line.startswith("一、单选题"):
        return "single"
    if line.startswith("二、多选题"):
        return "multi"
    if line.startswith("三、判断题"):
        return "judge"
    return section


def clean_prompt(text: str, answer: str) -> tuple[str, str]:
    source = ""
    source_match = SOURCE_RE.search(text)
    if source_match:
        source = source_match.group(1)
    text = SOURCE_RE.sub("", text).strip()

    text = re.sub(rf"[（(]{re.escape(answer)}[）)]", "（ ）", text, count=1).strip()
    return text, source


def finalize_choice(item: dict | None, questions: list[dict]) -> None:
    if not item:
        return
    if item.get("prompt") and item.get("answer") and len(item.get("options", [])) >= 2:
        questions.append(item)


def parse_questions(lines: list[str]) -> list[dict]:
    questions: list[dict] = []
    section: str | None = None
    current: dict | None = None
    last_option: dict | None = None
    pending_judge: str | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        next_section = current_section(line, section)
        if SECTION_RE.match(line):
            if section in {"single", "multi"}:
                finalize_choice(current, questions)
                current = None
                last_option = None
            section = next_section
            pending_judge = None
            continue

        if section in {"single", "multi"}:
            question_match = QUESTION_RE.match(line)
            option_match = OPTION_RE.match(line)

            if question_match:
                finalize_choice(current, questions)
                last_option = None
                number = int(question_match.group(1))
                body = question_match.group(2).strip()
                answer_match = ANSWER_RE.search(body)
                if not answer_match:
                    current = None
                    continue
                answer = answer_match.group(1)
                prompt, source = clean_prompt(body, answer)
                current = {
                    "id": f"{section}-{number}",
                    "type": section,
                    "number": number,
                    "prompt": prompt,
                    "answer": "".join(sorted(answer)),
                    "source": source,
                    "options": [],
                }
                continue

            if current and option_match:
                option = {
                    "key": option_match.group(1),
                    "text": option_match.group(2).strip(),
                }
                current["options"].append(option)
                last_option = option
                continue

            if current and last_option:
                last_option["text"] = f"{last_option['text']} {line}".strip()
            elif current:
                current["prompt"] = f"{current['prompt']} {line}".strip()
            continue

        if section == "judge":
            if pending_judge:
                line = f"{pending_judge} {line}"
                pending_judge = None

            question_match = QUESTION_RE.match(line)
            if not question_match:
                continue

            number = int(question_match.group(1))
            body = question_match.group(2).strip()
            answer_match = ANSWER_RE.search(body)
            if not answer_match:
                pending_judge = line
                continue

            answer = answer_match.group(1)
            prompt, source = clean_prompt(body, answer)
            questions.append(
                {
                    "id": f"judge-{number}",
                    "type": "judge",
                    "number": number,
                    "prompt": prompt,
                    "answer": answer,
                    "source": source,
                    "options": [
                        {"key": "√", "text": "正确"},
                        {"key": "×", "text": "错误"},
                    ],
                }
            )

    if section in {"single", "multi"}:
        finalize_choice(current, questions)

    return questions


def main() -> None:
    questions = parse_questions(extract_lines(DOCX))
    counts = {
        "single": sum(1 for item in questions if item["type"] == "single"),
        "multi": sum(1 for item in questions if item["type"] == "multi"),
        "judge": sum(1 for item in questions if item["type"] == "judge"),
    }

    payload = {
        "source": DOCX.name,
        "total": len(questions),
        "counts": counts,
        "questions": questions,
    }
    OUT.write_text(
        "window.QUESTION_BANK = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.name}: {len(questions)} questions {counts}")


if __name__ == "__main__":
    main()
