# -*- coding: utf-8 -*-
"""
Zagi — Thuat toan tach real_name tu Ho va ten (v3 FINAL)
Quy tac:
  0. Lam sach
  1. N == 1                -> giu nguyen
  2. Tu CUOI la "Anh"      -> LAY 2 TU CUOI  (luat cung, khong phu thuoc N)
  3. N <= 3                -> lay 1 tu cuoi
  4. N >= 4                -> lay 2 tu cuoi
"""
import re
import unicodedata

# ---- Cau hinh ----
SALUTATION_TAIL = {"anh"}          # tu cuoi thuoc nhom nay -> lay 2 tu
LEADING_TITLES = {"mr", "mrs", "ms", "miss", "a", "c", "e", "b",
                  "anh", "chi", "em", "co", "chu", "bac", "ong", "ba"}
SURNAMES = {"nguyen", "tran", "le", "pham", "hoang", "huynh", "phan", "vu", "vo",
            "dang", "bui", "do", "ho", "ngo", "duong", "ly", "mai", "trinh",
            "dinh", "lam", "truong", "cao", "chau", "ta", "quach", "ha", "tong"}
# CHI dung token DON khong the trung voi xung ho / ten nguoi
ORG_TOKENS = {"cty", "congty", "tnhh", "cp", "shop", "store", "kho", "ltd", "jsc"}
# Cum tu nhieu chu (an toan hon token don nhu "chi", "co")
ORG_PHRASES = ("cong ty", "cua hang", "chi nhanh", "doanh nghiep", "tap doan")

_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u2B00-\u2BFF\u2190-\u21FF]+")
_ZERO_WIDTH = re.compile("[\u200b-\u200f\u202a-\u202e\ufeff\u00a0]")


def no_accent(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("\u0111", "d").replace("\u0110", "D").lower()


def title_case_vi(s: str) -> str:
    return " ".join(w[:1].upper() + w[1:].lower() if w else w for w in s.split())


def extract_real_name(raw):
    issues, notes_extra, conf = [], [], 1.0
    if raw is None:
        return dict(real_name=None, confidence=0.0, branch="EMPTY",
                    issues=["EMPTY_NAME"], notes="", is_org=False)

    s = str(raw)
    s = _ZERO_WIDTH.sub(" ", s)

    # ngoac -> notes
    for m in re.findall(r"[\(\[]([^)\]]*)[\)\]]", s):
        if m.strip():
            notes_extra.append(m.strip())
    s = re.sub(r"[\(\[][^)\]]*[\)\]]", " ", s)
    if notes_extra:
        issues.append("PAREN_TO_NOTES"); conf = min(conf, 0.9)

    # emoji
    if _EMOJI.search(s):
        s = _EMOJI.sub(" ", s); issues.append("EMOJI_STRIPPED"); conf = min(conf, 0.9)

    # cat tai dau phan cach
    m = re.split(r"\s*[-|/_,]\s*", s)
    if len(m) > 1 and m[0].strip():
        tail = " ".join(x.strip() for x in m[1:] if x.strip())
        if tail:
            notes_extra.append(tail)
        s = m[0]; issues.append("CUT_AT_DELIMITER"); conf = min(conf, 0.85)

    # day so dai (SDT lan trong ten)
    if re.search(r"\d{8,}", s):
        s = re.sub(r"\d{8,}", " ", s); issues.append("DIGITS_STRIPPED"); conf = min(conf, 0.85)

    s = re.sub(r"[^\w\s\u00C0-\u1EF9]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return dict(real_name=None, confidence=0.0, branch="EMPTY",
                    issues=issues + ["EMPTY_NAME"], notes="; ".join(notes_extra), is_org=False)

    words = s.split()
    flat = [no_accent(w) for w in words]

    # bo tien to xung ho O DAU (lam TRUOC khi check to chuc,
    # de "Chi"/"Co" khong bi nham la "chi nhanh"/"cong ty")
    title_stripped = False
    if len(words) >= 3 and flat[0] in LEADING_TITLES:
        words, flat = words[1:], flat[1:]
        title_stripped = True
    elif len(words) >= 2 and flat[0] in {"mr", "mrs", "ms", "miss", "a", "c"}:
        words, flat = words[1:], flat[1:]
        title_stripped = True
    if title_stripped:
        issues.append("LEADING_TITLE_STRIPPED"); conf = min(conf, 0.9)

    # to chuc? (token don an toan + cum tu)
    flat_str = " ".join(flat)
    is_org = (any(f in ORG_TOKENS for f in flat[:3])
              or any(p in flat_str for p in ORG_PHRASES))
    if is_org:
        issues.append("ORGANIZATION"); conf = min(conf, 0.5)

    N = len(words)
    words = [title_case_vi(w) for w in words]

    # ---- QUY TAC ----
    if N == 1:
        real, branch = words[0], "N1"
    elif title_stripped and N == 2 and flat[0] not in SURNAMES:
        # "Chi Hong Nhung" -> sau khi bo xung ho, phan con lai KHONG co ho
        # => toan bo la ten goi
        real, branch = " ".join(words), "GIVEN_NAME_ONLY"
    elif flat[-1] in SALUTATION_TAIL:
        real, branch = " ".join(words[-2:]), "SALUTATION_TAIL"
        if N == 2 and flat[0] in SURNAMES:
            issues.append("SURNAME_PLUS_SALUTATION"); conf = min(conf, 0.7)
    elif N <= 3:
        real, branch = words[-1], "N<=3"
    else:
        real, branch = " ".join(words[-2:]), "N>=4"

    # canh bao thu tu Tay
    if N >= 2 and branch != "SALUTATION_TAIL" and flat[-1] in SURNAMES and flat[0] not in SURNAMES:
        issues.append("WESTERN_ORDER?"); conf = min(conf, 0.4)

    return dict(real_name=real, confidence=round(conf, 2), branch=branch,
                issues=issues, notes="; ".join(notes_extra), is_org=is_org,
                word_count=N)
