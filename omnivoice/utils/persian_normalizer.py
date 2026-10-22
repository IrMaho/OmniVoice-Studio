"""
persian_normalizer.py - High-precision text cleaner and normalizer for Persian TTS
Eliminates alien-like pronunciation, Arabic character mismatches, ZWNJ token breaks, and raw digits.
"""

import re
from typing import Optional

# Persian Number to Words mapping (0 to 9999)
ONES = {
    0: "صفر", 1: "یک", 2: "دو", 3: "سه", 4: "چهار", 5: "پنج",
    6: "شش", 7: "هفت", 8: "هشت", 9: "نه", 10: "ده",
    11: "یازده", 12: "دوازده", 13: "سیزده", 14: "چهارده", 15: "پانزده",
    16: "شانزده", 17: "هفده", 18: "هجده", 19: "نوزده",
}
TENS = {
    2: "بیست", 3: "سی", 4: "چهل", 5: "پنجاه",
    6: "شصت", 7: "هفتاد", 8: "هشتاد", 9: "نود",
}
HUNDREDS = {
    1: "صد", 2: "دویست", 3: "سیصد", 4: "چهارصد", 5: "پانصد",
    6: "ششصد", 7: "هفتصد", 8: "هشتصد", 9: "نهصد",
}

def num_to_persian_words(n: int) -> str:
    """Convert an integer between 0 and 9999 to Persian words."""
    if n < 0:
        return "منفی " + num_to_persian_words(-n)
    if n in ONES:
        return ONES[n]
    if n < 100:
        ten, one = divmod(n, 10)
        return TENS[ten] + (" و " + ONES[one] if one else "")
    if n < 1000:
        hundred, rest = divmod(n, 100)
        return HUNDREDS[hundred] + (" و " + num_to_persian_words(rest) if rest else "")
    if n < 1000000:
        thousand, rest = divmod(n, 1000)
        return (num_to_persian_words(thousand) + " هزار") + (" و " + num_to_persian_words(rest) if rest else "")
    return str(n)


PERSIAN_DIGITS_MAP = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

def convert_digits_to_words(text: str) -> str:
    """Replace all Arabic/Persian/English digits with spoken Persian words."""
    # First normalize all digits to standard ASCII 0-9
    t = text.translate(PERSIAN_DIGITS_MAP)
    
    def _repl(match):
        num_str = match.group(0)
        try:
            val = int(num_str)
            if val <= 999999:
                return num_to_persian_words(val)
        except Exception:
            pass
        return num_str

    return re.sub(r'\b\d+\b', _repl, t)


def normalize_persian_for_tts(text: str) -> str:
    """
    Comprehensive Persian normalizer:
    1. Normalizes Arabic letters (ي/ى -> ی, ك -> ک, ة -> ه)
    2. Eliminates ZWNJ (\u200c) byte breaks that cause robotic/alien stutter in BPE
    3. Converts numbers to words (e.g. 3 -> سه)
    4. Normalizes Persian punctuation (adds spaces around commas, cleans excessive dots)
    """
    if not text:
        return ""

    t = text

    # 1. Arabic character normalization
    t = t.replace('ي', 'ی').replace('ى', 'ی').replace('ك', 'ک').replace('ة', 'ه')

    # 2. Convert digits to spoken Persian words
    t = convert_digits_to_words(t)

    # 3. ZWNJ normalization:
    # Prefix 'می‌' and 'نمی‌' -> 'می ' and 'نمی ' (clean separation prevents token stutter)
    t = re.sub(r'\bمی‌', 'می ', t)
    t = re.sub(r'\bنمی‌', 'نمی ', t)
    
    # Common suffixes with ZWNJ -> attached or spaced without ZWNJ
    # e.g. 'کوچک‌تر' -> 'کوچک تر', 'لباس‌های' -> 'لباس های', 'خونه‌ای' -> 'خونه ای'
    t = re.sub(r'‌(تر|ترین|ها|های|هام|هات|هاش|مان|تان|شان|ای|ام|ات|اش|اید|اند)\b', r' \1', t)

    # Any remaining ZWNJs to regular space
    t = t.replace('\u200c', ' ')
    t = t.replace('\u200b', '') # zero-width space
    t = t.replace('\ufeff', '') # BOM

    # 4. Punctuation spacing (ensure commas and periods have proper breathing spaces)
    t = re.sub(r'([،؛:!؟?.,])', r'\1 ', t)
    t = re.sub(r'\s+', ' ', t).strip()

    # 5. Ensure terminal punctuation for natural sentence intonation
    if t and t[-1] not in '.!?،؛؟':
        t += '.'

    return t

# ---------------------------------------------------------------------------
# High-Coverage Persian Diacritizer / Vowelizer
# ---------------------------------------------------------------------------
PERSIAN_VOWEL_LEXICON = {
    # Pronouns
    "من": "مَن", "تو": "تو", "او": "او", "ما": "ما", "شما": "شُما", "ایشان": "ایشان",
    "آنها": "آن‌ها", "اینها": "این‌ها", "این": "این", "آن": "آن",
    "خود": "خود", "خودم": "خودَم", "خودت": "خودَت", "خودش": "خودَش",
    "خودمان": "خودِمان", "خودتان": "خودِتان", "خودشان": "خودِشان",

    # Prepositions & Conjunctions
    "به": "بِه", "در": "دَر", "از": "اَز", "بر": "بَر", "برای": "بَرایِ",
    "با": "با", "تا": "تا", "که": "کِه", "چون": "چون", "اگر": "اَگَر",
    "مگر": "مَگَر", "اما": "اَمّا", "ولی": "وَلی", "هم": "هَم",
    "همین": "هَمین", "همان": "هَمان", "همه": "هَمِه", "دیگر": "دیگَر",
    "سپس": "سِپَس", "بعد": "بَعد", "قبل": "قَبل", "پیش": "پیش",
    "بین": "بِینِ", "میان": "مِیانِ", "روی": "رویِ", "زیر": "زیرِ",

    # Greetings & Common Expressions
    "سلام": "سَلام", "درود": "دُرود", "صبح": "صُبح", "عصر": "عَصر", "شب": "شَب",
    "روز": "روز", "امروز": "اِمروز", "دیروز": "دیروز", "فردا": "فَردا",
    "الان": "اَلان", "حالا": "حالا", "حال": "حالِ", "احوال": "اَحوال",
    "خوب": "خوب", "خوش": "خوش", "خوبی": "خوبی", "خوبه": "خوبِه",
    "عالی": "عالی", "خیلی": "خِیلی", "بسیار": "بِسیار",
    "چطور": "چِطور", "چطوری": "چِطوری", "چگونه": "چِگونِه", "چرا": "چِرا",
    "کجا": "کُجا", "کی": "کِی", "چه": "چِه", "چی": "چی",
    "امیدوارم": "اُمیدوارَم", "ممنون": "مَمنون", "تشکر": "تَشَکُّر",
    "لطفا": "لُطفاً", "خواهش": "خواهـِش", "بله": "بَلِه", "آره": "آرِه",
    "خیر": "خِیر", "نه": "نَه",

    # Auxiliary Verbs & Common Verbs
    "است": "اَست", "هست": "هَست", "نیست": "نیست", "بود": "بود",
    "شد": "شُد", "شدم": "شُدَم", "شدی": "شُدی", "شدند": "شُدَند",
    "کن": "کُن", "کنم": "کُنَم", "کنی": "کُنی", "کند": "کُنَد",
    "کنیم": "کُنیم", "کنید": "کُنید", "کنند": "کُنَند",
    "میکنم": "می‌کُنَم", "میکنی": "می‌کُنی", "میکند": "می‌کُنَد",
    "میکنیم": "می‌کُنیم", "میکنید": "می‌کُنید", "میکنند": "می‌کُنَند",
    "نکن": "نَکُن", "نکنم": "نَکُنَم", "نکنی": "نَکُنی", "نکند": "نَکُنَد",
    "گفت": "گُفت", "گفتم": "گُفتَم", "گفتی": "گُفتی", "گفتند": "گُفتَند",
    "دارد": "دارَد", "دارم": "دارَم", "داری": "داری", "دارند": "دارَند",
    "داشتم": "داشتَم", "داشتی": "داشتی", "داشت": "داشت", "داشته": "داشتِه",
    "باشید": "باشید", "باشد": "باشَد", "باشم": "باشَم",
    "بایست": "بایَست", "باید": "بایَد", "نباید": "نَبایَد", "شاید": "شایَد",
    "میشود": "می‌شَوَد", "میشوم": "می‌شَوَم", "میشوی": "می‌شَوی", "میشوند": "می‌شَوَند",
    "میروم": "می‌رَوَم", "میروی": "می‌رَوی", "میرود": "می‌رَوَد",
    "میرویم": "می‌رَویم", "میروید": "می‌رَوید", "میروند": "می‌رَوَند",
    "رفت": "رَفت", "رفتم": "رَفتَم", "رفتی": "رَفتی", "رفتند": "رَفتَند",
    "برو": "بُرو", "بگو": "بِگو", "ببین": "بِبین", "بیا": "بیا",
    "بده": "بِدِه", "بگیر": "بِگیر", "بخون": "بِخون", "بخوان": "بِخوان",

    # Essential Vocabulary
    "صدا": "صِدا", "صدای": "صِدایِ", "صحبت": "صُحبَت", "حرف": "حَرف",
    "کلام": "کَلام", "کلمه": "کَلِمِه", "کلمات": "کَلِمات", "جمله": "جُملِه",
    "متن": "مَتن", "زبان": "زَبانِ", "فارسی": "فارسی", "انگلیسی": "اِنگلیسی",
    "هوش": "هوش", "مصنوعی": "مَصنوعی", "کیفیت": "کِیفیت", "سرعت": "سُرعَت",
    "دقت": "دِقَّت", "دانشگاه": "دانِشگاه", "مدرسه": "مَدرِسِه", "عزیز": "عَزیز",
    "دوست": "دوست", "دوستان": "دوستانِ", "پروژه": "پُروژِه", "تست": "تِست",
    "آزمایش": "آزمایِش", "تولید": "تولید", "شبیه": "شَبیِه", "شبیهسازی": "شَبیه‌سازی",
    "آدم": "آدَم", "انسان": "اِنسان", "دنیا": "دُنیا", "زندگی": "زِندِگی",
    "جهان": "جَهان", "کشور": "کِشوَر", "ایران": "ایران", "تهران": "تِهران",
}

def diacritize_persian(text: str) -> str:
    """Enhance Persian text with accurate vowelization and diacritics for natural TTS pronunciation."""
    if not text:
        return ""
    
    tokens = re.findall(r"[\w\u200c]+|[^\w\s\u200c]+|\s+", text, re.UNICODE)
    result = []
    
    for token in tokens:
        cleaned = token.replace("\u200c", "").strip()
        if cleaned in PERSIAN_VOWEL_LEXICON:
            result.append(PERSIAN_VOWEL_LEXICON[cleaned])
        elif token in PERSIAN_VOWEL_LEXICON:
            result.append(PERSIAN_VOWEL_LEXICON[token])
        else:
            if token.startswith("می‌") or token.startswith("می "):
                stem = token[3:]
                if stem in PERSIAN_VOWEL_LEXICON:
                    result.append("می‌" + PERSIAN_VOWEL_LEXICON[stem])
                    continue
            result.append(token)
            
    res_text = "".join(result)
    res_text = re.sub(r"([،؛:!؟?.,])", r"\1 ", res_text)
    res_text = re.sub(r"\s+", " ", res_text).strip()
    return res_text

def is_persian_text(text: str) -> bool:
    """Check if the text contains Persian / Arabic characters."""
    return bool(re.search(r'[\u0600-\u06FF]', text))
