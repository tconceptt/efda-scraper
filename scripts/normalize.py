"""
Normalization functions for product grouping data.

Cleans up generic_name, dosage_form, and dosage_strength so that the same
product (e.g. Ibuprofen 400 mg tablets) isn't split across 5+ dashboard rows
due to inconsistent casing, trailing dosage-form words, etc.
"""

from __future__ import annotations

import re

# ── Dosage-form words to strip from the end of generic names ────────────────

_FORM_SUFFIXES = [
    "oral suspension",
    "suspension",
    "tablets",
    "tablet",
    "capsules",
    "capsule",
    "injection",
    "syrup",
    "cream",
    "ointment",
    "gel",
    "drops",
    "solution",
    "powder",
]

# Pre-compile a pattern that matches any suffix at the end of a string,
# optionally preceded by whitespace.  Longest phrases first so
# "oral suspension" is tried before "suspension".
_FORM_SUFFIX_RE = re.compile(
    r"\s+(?:" + "|".join(re.escape(s) for s in _FORM_SUFFIXES) + r")\s*$",
    re.IGNORECASE,
)

# Pattern for trailing dosage info: "400 mg", "100mg/5ml", "400+325 mg", etc.
_TRAILING_DOSAGE_RE = re.compile(
    r"\s+\d[\d\s.+/]*\s*(?:mg|ml|mcg|g|iu|%|mg/\d+\s*ml)\s*$",
    re.IGNORECASE,
)

# "BP" qualifier (British Pharmacopoeia)
_BP_RE = re.compile(r"\s+BP\b", re.IGNORECASE)

# Combination separators: " & ", " and ", " / " → "+"
_COMBO_SEP_RE = re.compile(r"\s*(?:&|\band\b|/)\s*")


def normalize_generic_name(name: str) -> str:
    """Normalize a generic drug name for grouping.

    >>> normalize_generic_name("IBUPROFEN TABLETS")
    'ibuprofen'
    >>> normalize_generic_name("IBUPROFEN Tablets BP 400 mg")
    'ibuprofen'
    >>> normalize_generic_name("IBUPROFEN ORAL SUSPENSION BP 100MG/5ML")
    'ibuprofen'
    >>> normalize_generic_name("Ibuprofen and Paracetamol Suspension")
    'ibuprofen+paracetamol'
    >>> normalize_generic_name("IBUPROFEN+PSEUDOEPHEDRINE HCL+CHLORPHENIRAMINE MALEATE")
    'ibuprofen+pseudoephedrine hcl+chlorpheniramine maleate'
    """
    if not name:
        return ""

    s = name.strip().lower()

    # Remove BP qualifier early
    s = _BP_RE.sub("", s)

    # Remove trailing dosage info (e.g. "400 mg", "100mg/5ml")
    s = _TRAILING_DOSAGE_RE.sub("", s)

    # Remove trailing dosage-form words
    s = _FORM_SUFFIX_RE.sub("", s)

    # Normalize combination separators to "+"
    # But only between word tokens, not inside dosage ratios
    s = _COMBO_SEP_RE.sub("+", s)

    # Collapse whitespace and trim
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ── Dosage form canonical mapping ──────────────────────────────────────────

_DOSAGE_FORM_ALIASES: dict[str, list[str]] = {
    "TABLET": [
        "tablet", "tablets",
        "film coated tablet", "film-coated tablet",
        "tablet film coated", "tablet coated", "coated tablet",
        "sugar coated tablet",
        "chewable tablet", "dispersible tablet",
        "effervescent tablet", "enteric coated tablet",
    ],
    "CAPSULE": [
        "capsule", "capsules",
        "soft gelatin capsule", "hard gelatin capsule",
        "capsule liquid filled", "capsule gelatin",
    ],
    "SUSPENSION": [
        "suspension", "oral suspension",
        "for suspension", "powder for suspension",
        "powder for oral suspension", "dry suspension",
    ],
    "SYRUP": ["syrup"],
    "INJECTION": [
        "injection",
        "powder for injection", "solution for injection",
        "injection powder for solution",
        "lyophilized powder for injection",
    ],
    "CREAM": ["cream"],
    "OINTMENT": ["ointment"],
    "GEL": ["gel"],
    "DROPS": ["drops", "eye drops", "ear drops", "nasal drops", "oral drops"],
    "SOLUTION": ["solution", "oral solution"],
    "INHALER": ["inhaler", "metered dose inhaler", "dry powder inhaler"],
    "SUPPOSITORY": ["suppository"],
}

# Build reverse lookup: alias → canonical form
_FORM_LOOKUP: dict[str, str] = {}
for canonical, aliases in _DOSAGE_FORM_ALIASES.items():
    for alias in aliases:
        _FORM_LOOKUP[alias] = canonical


def normalize_dosage_form(form: str | None) -> str:
    """Map a dosage form string to its canonical form.

    >>> normalize_dosage_form("Film Coated Tablet")
    'TABLET'
    >>> normalize_dosage_form("Powder for Oral Suspension")
    'SUSPENSION'
    >>> normalize_dosage_form(None)
    ''
    >>> normalize_dosage_form("Nebulizer")
    'nebulizer'
    """
    if not form:
        return ""

    cleaned = form.strip().lower().replace("-", " ").replace(",", "")
    # Collapse multiple spaces
    cleaned = re.sub(r"\s+", " ", cleaned)

    if cleaned in _FORM_LOOKUP:
        return _FORM_LOOKUP[cleaned]

    # Return lowercase trimmed original if no match
    return cleaned


# ── Dosage strength normalization ──────────────────────────────────────────

# Units to strip (case-insensitive)
_UNIT_RE = re.compile(r"\s*(mg|ml|mcg|g|iu|%)\b", re.IGNORECASE)

# Descriptive combo: "Ibuprofen 100 mg and Paracetamol 125mg" → extract numbers
_DESCRIPTIVE_COMBO_RE = re.compile(
    r"[A-Za-z]+\s+(\d+[\d.]*)\s*(?:mg|ml|mcg|g|iu|%)"
    r"(?:\s*(?:and|&|\+|/)\s*"
    r"[A-Za-z]+\s+(\d+[\d.]*)\s*(?:mg|ml|mcg|g|iu|%))+",
    re.IGNORECASE,
)

# Trailing ".0" or ".00"
_TRAILING_DECIMAL_RE = re.compile(r"\.0+\b")


def normalize_dosage_strength(strength: str | None) -> str:
    """Normalize a dosage strength for grouping.

    >>> normalize_dosage_strength("400 mg")
    '400'
    >>> normalize_dosage_strength("400.0 mg")
    '400'
    >>> normalize_dosage_strength("100 mg/5 ml")
    '100/5'
    >>> normalize_dosage_strength("Ibuprofen 100 mg and Paracetamol 125mg")
    '100+125'
    >>> normalize_dosage_strength(None)
    ''
    >>> normalize_dosage_strength("")
    ''
    """
    if not strength:
        return ""

    s = strength.strip()

    # Handle descriptive combinations first
    # e.g. "Ibuprofen 100 mg and Paracetamol 125mg"
    desc_match = _DESCRIPTIVE_COMBO_RE.fullmatch(s)
    if desc_match:
        # Extract all numeric values from the descriptive string
        nums = re.findall(
            r"[A-Za-z]+\s+(\d+[\d.]*)\s*(?:mg|ml|mcg|g|iu|%)", s, re.IGNORECASE
        )
        if nums:
            parts = [_TRAILING_DECIMAL_RE.sub("", n) for n in nums]
            return "+".join(parts)

    # Strip units
    s = _UNIT_RE.sub("", s)

    # Remove trailing .0 / .00
    s = _TRAILING_DECIMAL_RE.sub("", s)

    # Normalize separators: strip spaces around + and /
    s = re.sub(r"\s*\+\s*", "+", s)
    s = re.sub(r"\s*/\s*", "/", s)

    # Collapse whitespace and trim
    s = re.sub(r"\s+", " ", s).strip()

    return s
