"""
Insider trades from SEC EDGAR Form 4 filings.
Uses the EDGAR submissions API (free, no key required).
"""

import httpx
import xml.etree.ElementTree as ET
from datetime import datetime
from app.services.financials import _edgar_cik_map, EDGAR_HEADERS

EDGAR_BASE = "https://data.sec.gov"
ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"

# In-process cache: ticker → (fetched_at, trades_list)
_insider_cache: dict[str, tuple[datetime, list]] = {}
_CACHE_TTL_HOURS = 12


def get_insider_trades(ticker: str, max_trades: int = 30) -> list[dict]:
    ticker = ticker.upper()
    now = datetime.utcnow()

    cached = _insider_cache.get(ticker)
    if cached:
        fetched_at, trades = cached
        if (now - fetched_at).total_seconds() < _CACHE_TTL_HOURS * 3600:
            return trades

    cik_map = _edgar_cik_map()
    cik = cik_map.get(ticker)
    if not cik:
        return []

    cik_str = str(cik).zfill(10)
    r = httpx.get(
        f"{EDGAR_BASE}/submissions/CIK{cik_str}.json",
        headers=EDGAR_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()

    recent = data.get("filings", {}).get("recent", {})
    forms         = recent.get("form", [])
    dates         = recent.get("filingDate", [])
    accessions    = recent.get("accessionNumber", [])
    primary_docs  = recent.get("primaryDocument", [])

    # Collect Form 4 filings (accession, date, primary doc)
    form4_filings: list[tuple[str, str, str]] = []
    for form, date, acc, doc in zip(forms, dates, accessions, primary_docs):
        if form == "4":
            form4_filings.append((acc, date, doc))
        if len(form4_filings) >= max_trades:
            break

    trades: list[dict] = []
    for acc, filing_date, doc in form4_filings:
        try:
            parsed = _parse_form4(cik, acc, filing_date, doc)
            if parsed:
                trades.extend(parsed)
        except Exception:
            continue
        if len(trades) >= max_trades:
            break

    trades = trades[:max_trades]
    _insider_cache[ticker] = (now, trades)
    return trades


def _parse_form4(cik: int, accession: str, filing_date: str, primary_doc: str) -> list[dict]:
    acc_clean = accession.replace("-", "")
    # primaryDocument is often "xslF345X06/form4.xml" — the xsl prefix is the renderer,
    # not part of the file path. Strip it to get the raw data XML.
    raw_doc = primary_doc.split("/")[-1] if "/" in primary_doc else primary_doc
    xml_url = f"{ARCHIVES_BASE}/{cik}/{acc_clean}/{raw_doc}"

    try:
        resp = httpx.get(xml_url, headers=EDGAR_HEADERS, timeout=10)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
    except Exception:
        return []

    # Reporter info
    reporter_name  = _xml_text(root, ".//reportingOwner/reportingOwnerId/rptOwnerName") or "Unknown"
    officer_title  = _xml_text(root, ".//reportingOwner/reportingOwnerRelationship/officerTitle") or ""
    is_director    = _xml_text(root, ".//reportingOwner/reportingOwnerRelationship/isDirector") in ("1", "true")
    is_officer     = _xml_text(root, ".//reportingOwner/reportingOwnerRelationship/isOfficer") in ("1", "true")
    is_ten_pct     = _xml_text(root, ".//reportingOwner/reportingOwnerRelationship/isTenPercentOwner") in ("1", "true")

    if not officer_title:
        if is_ten_pct:
            officer_title = "10% Owner"
        elif is_director:
            officer_title = "Director"
        elif is_officer:
            officer_title = "Officer"

    trades: list[dict] = []

    for txn in root.findall(".//nonDerivativeTransaction"):
        trade = _parse_transaction(txn, reporter_name, officer_title, filing_date, derivative=False)
        if trade:
            trades.append(trade)

    for txn in root.findall(".//derivativeTransaction"):
        trade = _parse_transaction(txn, reporter_name, officer_title, filing_date, derivative=True)
        if trade:
            trades.append(trade)

    return trades


def _parse_transaction(txn: ET.Element, name: str, title: str, filing_date: str, derivative: bool) -> dict | None:
    code = _xml_text(txn, ".//transactionCoding/transactionCode") or ""
    if code not in ("P", "S", "A", "D", "F", "M", "C", "G", "J", "X"):
        return None

    date_str  = _xml_text(txn, ".//transactionDate/value") or filing_date
    shares    = _safe_float(_xml_text(txn, ".//transactionAmounts/transactionShares/value"))
    price     = _safe_float(_xml_text(txn, ".//transactionAmounts/transactionPricePerShare/value"))
    owned     = _safe_float(_xml_text(txn, ".//postTransactionAmounts/sharesOwnedFollowingTransaction/value"))

    if shares is None or shares == 0:
        return None

    if code == "P":
        txn_type = "Buy"
    elif code == "S":
        txn_type = "Sell"
    elif code in ("A", "M", "C"):
        txn_type = "Award/Exercise"
    elif code in ("D", "F"):
        txn_type = "Disposition"
    else:
        txn_type = "Other"

    value = round(shares * price, 2) if price and price > 0 else None

    return {
        "date": date_str,
        "filing_date": filing_date,
        "name": name,
        "title": title,
        "transaction_type": txn_type,
        "transaction_code": code,
        "shares": int(shares),
        "price": round(price, 2) if price and price > 0 else None,
        "value": value,
        "shares_owned": int(owned) if owned else None,
        "is_derivative": derivative,
    }


def _xml_text(root: ET.Element, path: str) -> str | None:
    el = root.find(path)
    return el.text.strip() if el is not None and el.text else None


def _safe_float(s: str | None) -> float | None:
    if not s:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None
