import contextlib
import json
import os
import sys
import threading
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ChatHistory
from .serializers import ChatHistorySerializer

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
SRC_DIR = PROJECT_ROOT / "src"

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env")

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

_rag_lock = threading.Lock()
_rag_ask = None
_rag_error = None
_rag_items_cache = None


@contextlib.contextmanager
def working_directory(path):
    previous = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


def get_openai_client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key)


def has_rag_assets(root):
    return (
        (root / "data" / "processed").exists()
        and (root / "vectorstore" / "faiss_index").exists()
    )


def get_rag_root():
    candidates = []

    env_root = os.getenv("RAG_ROOT")
    if env_root:
        candidates.append(Path(env_root))

    candidates.append(PROJECT_ROOT)
    candidates.append(PROJECT_ROOT.parent / "MediPick")

    for candidate in candidates:
        candidate = candidate.expanduser().resolve()
        if has_rag_assets(candidate):
            return candidate

    return None


def get_rag_ask():
    global _rag_ask, _rag_error

    if _rag_ask is not None:
        return _rag_ask

    with _rag_lock:
        if _rag_ask is not None:
            return _rag_ask

        rag_root = get_rag_root()
        if rag_root is None:
            _rag_error = "RAG data or FAISS index was not found."
            return None

        try:
            from rag_chain import load_rag

            with working_directory(rag_root):
                _rag_ask = load_rag()

            _rag_error = None
            return _rag_ask
        except Exception as exc:
            _rag_error = str(exc)
            return None


def convert_label(value):
    labels = {
        "FEMALE": "여성",
        "MALE": "남성",
        "OTHER": "기타",
        "UNKNOWN": "미입력",
        "NONE": "해당 없음",
        "PREGNANT": "임신 중",
        "BREASTFEEDING": "수유 중",
    }
    return labels.get(value, value or "미입력")


def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip()


def is_meaningful(value):
    text = normalize_text(value)
    return bool(text) and text not in {"없음", "해당 없음", "무", "none", "None", "NONE"}


def build_profile_context(profile):
    return f"""
나이: {profile.age}세
성별: {convert_label(profile.gender)}
키: {profile.height}cm
체중: {profile.weight}kg
혈액형: {convert_label(profile.blood_type)}
임신/수유 여부: {convert_label(profile.pregnancy_status)}
알레르기: {profile.allergies or '없음'}
기저질환: {profile.diseases or '없음'}
복용 중인 약: {profile.current_medications or '없음'}
"""


def build_personalized_warnings(profile):
    warnings = []

    if is_meaningful(profile.allergies):
        warnings.append(f"알레르기 정보: {profile.allergies}")

    if is_meaningful(profile.diseases):
        warnings.append(f"기저질환 정보: {profile.diseases}")

    if is_meaningful(profile.current_medications):
        warnings.append(f"복용 중인 약 정보: {profile.current_medications}")

    if profile.pregnancy_status == "PREGNANT":
        warnings.append("임신 중")

    if profile.pregnancy_status == "BREASTFEEDING":
        warnings.append("수유 중")

    if not warnings:
        warnings.append("등록된 고위험 건강정보 없음")

    return "\n".join([f"- {item}" for item in warnings])


def has_profile_risk(profile):
    return any(
        [
            is_meaningful(profile.allergies),
            is_meaningful(profile.diseases),
            is_meaningful(profile.current_medications),
            profile.pregnancy_status in {"PREGNANT", "BREASTFEEDING"},
        ]
    )


def is_broad_tylenol_question(question):
    text = normalize_text(question)
    if "타이레놀" not in text:
        return False

    specific_terms = [
        "타이레놀콜드",
        "어린이타이레놀",
        "우먼스타이레놀",
        "타이레놀산",
        "타이레놀정500",
        "타이레놀8시간",
        "이알서방정",
        "현탁액",
    ]
    return not any(term in text for term in specific_terms)


def build_primary_rag_question(question):
    if not is_broad_tylenol_question(question):
        return question

    return f"""
사용자 원문 질문: {question}

이 질문의 '타이레놀'은 특정 단일 제품명이 아니라 타이레놀 브랜드 또는 아세트아미노펜 성분 제품군을 뜻할 수 있습니다.
타이레놀콜드-에스정 하나로 단정하지 말고, 검색 문서에 있는 다음 제품군을 구분해서 답변하세요.
- 타이레놀정500밀리그람(아세트아미노펜)
- 타이레놀산500밀리그램(아세트아미노펜)
- 타이레놀8시간이알서방정(아세트아미노펜)
- 어린이타이레놀 제품
- 타이레놀콜드-에스정

답변할 때는 먼저 '타이레놀은 제품 종류가 여러 가지라 제품별 복용법이 다를 수 있다'고 설명하세요.
사용자 질문이 공복 복용 여부라면, 문서에서 식후 30분 복용이 명시된 제품과 식후 조건이 직접 확인되지 않는 제품을 구분하세요.
문서에 없는 내용은 일반화하지 말고 '문서에서 직접 확인되지 않음'이라고 말하세요.
"""



def add_compact_instruction(question):
    return f"""{question}

[웹서비스 답변 길이 제한]
- 전체 답변은 가능한 한 700자 이내로 작성하세요.
- 섹션은 답변, 제품 후보, 주의 후보, 주의사항 중심으로만 구성하세요.
- 제품 후보 표는 최대 5개만 작성하세요.
- 출처 목록, 긴 설명, 반복 문장, 불필요한 배경 설명은 쓰지 마세요.
"""
def prepend_broad_brand_notice(answer, question, sources):
    if not is_broad_tylenol_question(question):
        return answer

    source_titles = [source.get("title", "") for source in sources or []]
    has_cold_only = source_titles and all("콜드" in title for title in source_titles)

    notice = (
        "### 제품 구분 안내\n"
        "타이레놀은 타이레놀정500밀리그람, 타이레놀산500밀리그램, "
        "타이레놀8시간이알서방정, 어린이타이레놀, 타이레놀콜드-에스정처럼 여러 제품이 있습니다. "
        "따라서 특정 제품 하나의 복용법을 전체 타이레놀 제품군에 그대로 적용하면 안 됩니다.\n"
    )

    if has_cold_only:
        notice += (
            "현재 검색 결과가 감기약 계열인 타이레놀콜드-에스정에 치우쳐 있어, "
            "일반 타이레놀 단일제 복용법은 제품 포장 또는 약사에게 추가 확인하는 것이 좋습니다.\n"
        )

    if answer.lstrip().startswith("### 제품 구분 안내"):
        return answer

    return f"{notice}\n---\n\n{answer}"

def build_profile_risk_query(question, profile):
    if not has_profile_risk(profile):
        return None

    risk_parts = []
    if is_meaningful(profile.allergies):
        risk_parts.append(f"알레르기: {profile.allergies}")
    if is_meaningful(profile.diseases):
        risk_parts.append(f"기저질환: {profile.diseases}")
    if is_meaningful(profile.current_medications):
        risk_parts.append(f"현재 복용약: {profile.current_medications}")
    if profile.pregnancy_status in {"PREGNANT", "BREASTFEEDING"}:
        risk_parts.append(f"임신/수유 상태: {convert_label(profile.pregnancy_status)}")

    risk_context = ", ".join(risk_parts)
    return f"""
사용자의 건강정보는 다음과 같습니다: {risk_context}
사용자 질문: {question}

위 건강정보와 질문을 함께 고려해서 의약품 문서에 근거하여 답변하세요.
특히 다음을 한국어로 간단히 정리하세요.
1. 피하거나 주의해야 할 가능성이 있는 약 성분, 약 계열, 제품군
2. 왜 주의가 필요한지
3. 약사 또는 의사에게 확인해야 할 질문

문서에서 확인되지 않은 내용은 단정하지 말고 '문서에서 직접 확인되지 않음'이라고 말하세요. 답변은 최대 3개 bullet로 아주 짧게 작성하세요. 영문 문서 제목이나 원문 섹션명은 절대 쓰지 말고, 사용자에게 보여줄 한국어 주의 내용만 작성하세요. 제품명만 단독으로 쓰지 말고 왜 주의해야 하는지 함께 쓰세요.
"""


def merge_sources(*source_groups):
    merged = []
    seen = set()

    for group in source_groups:
        for source in group or []:
            key = (
                source.get("title"),
                source.get("manufacturer"),
                source.get("source"),
                source.get("url"),
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(source)

    return merged


def load_rag_items():
    global _rag_items_cache

    if _rag_items_cache is not None:
        return _rag_items_cache

    rag_root = get_rag_root()
    if rag_root is None:
        _rag_items_cache = []
        return _rag_items_cache

    items = []
    for path in (rag_root / "data" / "processed").glob("*.json"):
        try:
            with open(path, "r", encoding="utf-8") as file:
                data = json.load(file)
        except Exception:
            continue

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    item = {**item, "_file_source": path.name}
                    items.append(item)

    _rag_items_cache = items
    return _rag_items_cache


def find_rag_item_by_title(title):
    normalized_title = normalize_text(title)
    for item in load_rag_items():
        item_title = normalize_text(item.get("title") or item.get("metadata", {}).get("title"))
        if item_title == normalized_title:
            return item
    return None


def item_to_source(item):
    metadata = item.get("metadata", {}) or {}
    return {
        "title": item.get("title") or metadata.get("title") or "제목 없음",
        "manufacturer": metadata.get("manufacturer", ""),
        "source": item.get("source") or metadata.get("source") or item.get("_file_source", "RAG corpus"),
        "url": item.get("url") or metadata.get("url", ""),
    }


def extract_usage_note(content):
    text = normalize_text(content)
    if "식후 30분" in text:
        return "식후 30분 복용으로 문서에 명시"
    if "식후" in text:
        return "식후 복용 표현이 문서에 있음"
    if "필요시" in text or "필요 시" in text:
        return "필요 시 복용으로 문서에 명시, 식후 조건은 직접 확인되지 않음"
    return "식후/공복 조건은 문서에서 직접 확인되지 않음"


def build_tylenol_product_context(question):
    if not is_broad_tylenol_question(question):
        return "", []

    target_titles = [
        "타이레놀정500밀리그람(아세트아미노펜)",
        "타이레놀산500밀리그램(아세트아미노펜)",
        "타이레놀8시간이알서방정(아세트아미노펜)",
        "어린이타이레놀산160밀리그램(아세트아미노펜)",
        "어린이타이레놀현탁액(아세트아미노펜)",
        "타이레놀콜드-에스정",
    ]

    rows = []
    sources = []
    for title in target_titles:
        item = find_rag_item_by_title(title)
        if not item:
            continue

        source = item_to_source(item)
        sources.append(source)
        rows.append(
            "| {title} | {manufacturer} | {usage} |".format(
                title=source["title"],
                manufacturer=source["manufacturer"] or "제조사 정보 없음",
                usage=extract_usage_note(item.get("content", "")),
            )
        )

    if not rows:
        return "", []

    section = "\n".join([
        "### 제품별 문서 기준 확인",
        "타이레놀 브랜드에는 여러 제품이 있어 제품별 복용법을 분리해서 확인해야 합니다.",
        "",
        "| 제품명 | 제조사 | 공복/식후 관련 문서 근거 |",
        "|---|---|---|",
        *rows,
        "",
        "일반 타이레놀 단일제 문서에서 식후 조건이 직접 확인되지 않는다고 해서 공복 복용을 무조건 권장한다는 뜻은 아닙니다. 위장 불편, 음주, 간질환, 다른 아세트아미노펜 함유 약 복용 여부가 있으면 약사 또는 의사에게 확인하세요.",
    ])

    return section, sources

def append_profile_note(answer, personalized_warnings, profile_risk_answer=None):
    sections = [answer.strip()]

    if profile_risk_answer:
        sections.append(
            "### 개인 건강정보 기준 주의 약물\n"
            f"{profile_risk_answer.strip()}"
        )

    sections.append(
        "### 개인 건강정보 기반 참고\n"
        f"{personalized_warnings}\n\n"
        "위 건강정보에 해당하는 항목이 있다면 일반적인 복용 기준과 다를 수 있으므로, "
        "정확한 복용 가능 여부는 의사 또는 약사와 상담하세요."
    )

    return "\n\n---\n\n".join(sections)


def format_sources_for_text(sources, limit=3):
    if not sources:
        return ""

    lines = ["", "### 참고 출처"]
    for index, source in enumerate(sources[:limit], start=1):
        title = source.get("title") or "제목 없음"
        manufacturer = source.get("manufacturer") or ""
        source_name = source.get("source") or ""
        detail = title
        if manufacturer:
            detail += f" / {manufacturer}"
        if source_name:
            detail += f" / {source_name}"
        lines.append(f"{index}. {detail}")

    if len(sources) > limit:
        lines.append(f"외 {len(sources) - limit}개 문서 참고")

    return "\n".join(lines)



def cleanup_line(text):
    return normalize_text(text).strip(" |-")


def limit_text(text, max_chars=260):
    text = " ".join(normalize_text(text).split())
    if len(text) <= max_chars:
        return text

    clipped = text[:max_chars].rstrip()
    sentence_ends = [clipped.rfind(mark) for mark in [".", "다", "요", "함", "음"]]
    sentence_end = max(sentence_ends)
    if sentence_end >= max_chars * 0.45:
        return clipped[: sentence_end + 1].rstrip()

    last_space = clipped.rfind(" ")
    if last_space >= max_chars * 0.45:
        return clipped[:last_space].rstrip()

    return clipped

def extract_answer_summary(answer):
    lines = []
    capture = False

    for raw_line in answer.splitlines():
        line = cleanup_line(raw_line)
        if not line:
            continue

        if line.startswith("###"):
            title = line.replace("###", "").strip()
            if title in {"답변", "요약", "간단 답변"}:
                capture = True
                continue
            if capture:
                break

        if line == "---":
            if capture:
                break
            continue

        if not capture and not line.startswith("|"):
            capture = True

        if capture and not line.startswith("|") and not set(line) <= {"-", "|", " "}:
            lines.append(line)

        if len(" ".join(lines)) >= 260:
            break

    summary = " ".join(lines) if lines else answer
    return limit_text(summary, 300)


def is_product_like_source(source):
    title = normalize_text(source.get("title"))
    manufacturer = normalize_text(source.get("manufacturer"))

    if not title or title == "제목 없음":
        return False
    if is_document_title_noise(title):
        return False
    if " - " in title and not has_korean(title):
        return False

    product_hints = [
        "정",
        "캡슐",
        "시럽",
        "현탁액",
        "산",
        "액",
        "과립",
        "연질",
        "서방",
        "밀리그램",
        "mg",
    ]
    if manufacturer and manufacturer != "제조사 정보 없음":
        return True
    return any(hint in title for hint in product_hints)


def filter_product_sources(sources):
    product_sources = [source for source in sources if is_product_like_source(source)]
    return product_sources or []


def build_product_candidate_section(sources, limit=5):
    product_sources = filter_product_sources(sources)
    if not product_sources:
        return "- 확인된 제품 후보가 없습니다."

    rows = ["| 제품명 | 제조사 |", "|---|---|"]
    for source in product_sources[:limit]:
        title = source.get("title") or "제목 없음"
        manufacturer = source.get("manufacturer") or "제조사 정보 없음"
        rows.append(f"| {title} | {manufacturer} |")

    if len(product_sources) > limit:
        rows.append(f"| 외 {len(product_sources) - limit}개 후보 | 화면 하단 참고 출처 확인 |")

    return "\n".join(rows)


def has_korean(text):
    return any("가" <= char <= "힣" for char in normalize_text(text))


def is_document_title_noise(text):
    line = normalize_text(text).lower()
    noise_terms = [
        "warnings",
        "warning",
        "dosage",
        "dailymed",
        "source",
        "document",
        "index",
    ]
    if any(term in line for term in noise_terms):
        return True

    letters = [char for char in line if char.isalpha()]
    ascii_letters = [char for char in letters if ord(char) < 128]
    if letters and len(ascii_letters) / len(letters) > 0.75 and not has_korean(line):
        return True

    return False

def is_table_artifact(raw_line, cleaned_line):
    raw = normalize_text(raw_line)
    line = normalize_text(cleaned_line)
    if "|" in raw or "|" in line:
        return True
    table_words = ["제품명", "제조사", "관련 증상", "효능", "핵심 정보"]
    return sum(1 for word in table_words if word in line) >= 2
def extract_risk_summary(profile_risk_answer, personalized_warnings):
    if profile_risk_answer:
        items = []
        for raw_line in profile_risk_answer.splitlines():
            line = cleanup_line(raw_line)
            if not line or line.startswith("###") or line.startswith("|"):
                continue
            if is_table_artifact(raw_line, line):
                continue
            if line.startswith(("-", "*")):
                line = cleanup_line(line[1:])
            if is_table_artifact(raw_line, line):
                continue
            if is_document_title_noise(line) or not has_korean(line):
                continue
            if "현재 질문만으로는" in line and "단정" in line:
                continue

            items.append(limit_text(line, 120))
            if len(items) >= 3:
                break

        if items:
            return "\n".join(f"- {item}" for item in items)

    if "건강정보 없음" in personalized_warnings or "고위험 건강정보 없음" in personalized_warnings:
        return "- 등록된 알레르기나 기저질환 기준으로 별도 주의 후보는 확인되지 않았습니다."

    return (
        f"{personalized_warnings}\n"
        "- 위 건강정보에 해당하면 제품 후보의 성분, 금기, 주의 문구를 약사에게 확인하세요."
    )

def build_final_compact_answer(answer, sources, personalized_warnings, profile_risk_answer=None):
    return "\n\n".join([
        "### 답변\n" + extract_answer_summary(answer),
        "### 제품 후보\n" + build_product_candidate_section(sources),
        "### 내 건강정보 기준 주의 후보\n" + extract_risk_summary(profile_risk_answer, personalized_warnings),
        (
            "### 주의사항\n"
            "- 제품명이 비슷해도 성분, 함량, 복용법이 다를 수 있습니다.\n"
            "- 알레르기, 천식, 간·신장질환, 임신·수유, 다른 약 복용 중이면 복용 전 약사 또는 의사에게 확인하세요.\n"
            "- 본 답변은 참고용이며 정확한 복용 여부는 전문가와 상담하시기 바랍니다."
        ),
    ])
def build_direct_prompt(question, profile_context, personalized_warnings):
    return f"""
당신은 의약품 정보 제공을 돕는 한국어 AI 상담 보조 시스템입니다.

아래 사용자의 건강정보는 답변 생성에 참고만 하세요.
답변 본문에서 건강정보 전체를 그대로 나열하지 마세요.

사용자 건강정보:
{profile_context}

개인별 주의 요인:
{personalized_warnings}

사용자 질문:
{question}

답변 조건:
- 사용자가 물어본 질문에 먼저 답하세요.
- 필요한 경우 알레르기, 기저질환, 복용 중인 약, 임신/수유 여부를 자연스럽게 반영하세요.
- 피하거나 주의해야 할 약 성분/계열이 있으면 별도 항목으로 정리하세요.
- 확실하지 않은 내용은 단정하지 말고 의사 또는 약사 상담을 권고하세요.
- 답변은 한국어로 작성하세요.

마지막에는 반드시 아래 문장을 포함하세요.
"본 답변은 참고용이며, 정확한 복용 여부는 의사 또는 약사와 상담하시기 바랍니다."
"""


def build_default_answer(personalized_warnings):
    return f"""
### 간단 답변
질문하신 약은 개인의 건강 상태와 함께 복용 중인 약에 따라 주의사항이 달라질 수 있습니다.

### 개인 건강정보 기반 주의사항
등록된 건강정보를 기준으로 확인이 필요한 부분은 다음과 같습니다.

{personalized_warnings}

해당 항목이 있는 경우, 일반적인 복용 기준과 다르게 주의가 필요할 수 있습니다.

### 추가로 확인하면 좋은 정보
정확한 판단을 위해서는 약의 성분명, 복용량, 복용 횟수, 현재 복용 중인 다른 약을 함께 확인하는 것이 좋습니다.

### 전문가 상담 권고
특정 알레르기, 기저질환, 임신/수유 여부, 다른 약 복용 여부가 있는 경우에는 의사 또는 약사와 상담 후 복용하는 것이 안전합니다.

본 답변은 참고용이며, 정확한 복용 여부는 의사 또는 약사와 상담하시기 바랍니다.
"""


def answer_with_rag(question, profile, personalized_warnings):
    ask = get_rag_ask()
    if ask is None:
        return None, [], "fallback", _rag_error

    rag_question = add_compact_instruction(build_primary_rag_question(question))
    answer, sources, question_type = ask(rag_question)

    profile_risk_answer = None
    profile_risk_sources = []
    risk_query = build_profile_risk_query(question, profile) if profile else None

    if risk_query:
        try:
            profile_risk_answer, profile_risk_sources, _ = ask(risk_query)
        except Exception:
            profile_risk_answer = None
            profile_risk_sources = []

    tylenol_section, tylenol_sources = build_tylenol_product_context(question)
    if tylenol_section:
        answer = f"{answer}\n\n---\n\n{tylenol_section}"

    sources = merge_sources(tylenol_sources, sources, profile_risk_sources)
    answer = build_final_compact_answer(
        answer=answer,
        sources=sources,
        personalized_warnings=personalized_warnings,
        profile_risk_answer=profile_risk_answer,
    )

    return answer, sources, question_type, None

def answer_with_direct_llm(question, profile_context, personalized_warnings):
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "당신은 의약품 정보를 쉽게 설명하는 한국어 AI 상담 보조 시스템입니다.",
            },
            {
                "role": "user",
                "content": build_direct_prompt(question, profile_context, personalized_warnings),
            },
        ],
        temperature=0.2,
    )

    return response.choices[0].message.content


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chat(request):
    user = request.user
    question = request.data.get("question")

    if not question or not question.strip():
        return Response(
            {"error": "질문을 입력해주세요."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    question = question.strip()
    profile = None

    try:
        profile = user.health_profile
        profile_context = build_profile_context(profile)
        personalized_warnings = build_personalized_warnings(profile)
    except Exception:
        profile_context = "사용자 건강정보가 등록되어 있지 않습니다."
        personalized_warnings = "- 건강정보 없음"

    sources = []
    question_type = "fallback"
    answer_mode = "fallback"
    rag_error = None

    try:
        rag_answer, sources, question_type, rag_error = answer_with_rag(
            question,
            profile,
            personalized_warnings,
        )
        if rag_answer:
            answer = rag_answer
            answer_mode = "rag"
        else:
            answer = answer_with_direct_llm(
                question,
                profile_context,
                personalized_warnings,
            )
            answer_mode = "direct_llm"
    except Exception:
        answer = build_default_answer(personalized_warnings)
        answer_mode = "default"

    chat_history = ChatHistory.objects.create(
        user=user,
        question=question,
        answer=answer,
    )

    return Response({
        "id": chat_history.id,
        "question": question,
        "answer": answer,
        "sources": sources,
        "question_type": question_type,
        "answer_mode": answer_mode,
        "rag_error": rag_error,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def chat_history(request):
    histories = ChatHistory.objects.filter(user=request.user).order_by("-created_at")
    serializer = ChatHistorySerializer(histories, many=True)
    return Response(serializer.data)
