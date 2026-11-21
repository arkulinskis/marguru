"""Scores ("Did it work?", 2026-11-20): a plan's monthly numbers, so the owner can see what works and paste both
months into the monthly report prompt. One row per plan and month:
    scores: plan -> plans, owner -> users, month "YYYY-MM", numbers {key: number}, note str, updated dt
Only the plan's owner (or an admin) can read or change them (Plans._own). Guests keep theirs in the browser
(localStorage marguru.scores.local) and the example's months are built into the page.
"""
import re

import anvil.server
from anvil.tables import app_tables

from . import common as C
from .Plans import _own

MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
KEYS = ("calls", "enquiries", "customers", "sales", "reviews", "spend")  # the only numbers a month can hold
MAX_MONTHS = 36
MAX_VALUE = 1_000_000_000
NOT_READY = "Monthly numbers are still being switched on. Please try again in a little while."
NOT_YOURS = "That plan doesn't exist, or it isn't yours."


def _table():
    """The scores table, or None until the user has accepted the new schema in the Anvil editor."""
    try:
        t = app_tables.scores
        t.search()  # raises when the table doesn't exist yet
        return t
    except Exception:
        return None


def clean_numbers(numbers):
    """{key: value} from the browser -> only the known keys, as non-negative numbers (blank = left out).
    Raises ValueError for junk keys or values."""
    if not isinstance(numbers, dict):
        raise ValueError("Those numbers don't look right.")
    out = {}
    for k, v in numbers.items():
        if k not in KEYS:
            raise ValueError("Unknown number: %s" % str(k)[:30])
        if v is None or v == "":
            continue
        if isinstance(v, bool):
            raise ValueError("Numbers only, please.")
        try:
            n = float(v)
        except (TypeError, ValueError):
            raise ValueError("Numbers only, please.")
        if n != n or n < 0 or n > MAX_VALUE:
            raise ValueError("Use a number between 0 and 1,000,000,000.")
        out[k] = int(n) if n == int(n) else round(n, 2)
    return out


def _row(r):
    return {"month": r["month"], "numbers": dict(r["numbers"] or {}), "note": r["note"] or "", "updated": C.iso(r["updated"])}


@anvil.server.callable(require_user=True)
def list_scores(plan_id):
    """{ok, scores: [{month, numbers, note, updated}] newest first} for one of your plans."""
    _, plan = _own(plan_id)
    if plan is None:
        return C.fail(NOT_YOURS)
    t = _table()
    if t is None:
        return C.fail(NOT_READY)
    rows = sorted(t.search(plan=plan), key=lambda r: r["month"], reverse=True)
    return C.ok(scores=[_row(r) for r in rows])


@anvil.server.callable(require_user=True)
def save_score(plan_id, month, numbers, note=""):
    """Add or replace one month's numbers. month = "YYYY-MM"; numbers only with KEYS; at most MAX_MONTHS per plan."""
    me, plan = _own(plan_id)
    if plan is None:
        return C.fail(NOT_YOURS)
    if not isinstance(month, str) or not MONTH.match(month):
        return C.fail("Pick a month.")
    try:
        nums = clean_numbers(numbers)
    except ValueError as e:
        return C.fail(str(e))
    t = _table()
    if t is None:
        return C.fail(NOT_READY)
    text = C.text(note, 500, multiline=True)
    r = t.get(plan=plan, month=month)
    if r is None:
        if len(t.search(plan=plan)) >= MAX_MONTHS:
            return C.fail("This plan already has %d months of numbers. Delete an old month first." % MAX_MONTHS)
        if C.rate_limited("save_score", 120, 3600):
            return C.fail("That's a lot of saving in one hour. Please try again later.")
        r = t.add_row(plan=plan, owner=plan["owner"] or me, month=month, numbers=nums, note=text, updated=C.now())
    else:
        r.update(numbers=nums, note=text, updated=C.now())
    return C.ok(score=_row(r))


@anvil.server.callable(require_user=True)
def delete_score(plan_id, month):
    _, plan = _own(plan_id)
    if plan is None:
        return C.fail(NOT_YOURS)
    if not isinstance(month, str) or not MONTH.match(month):
        return C.fail("Pick a month.")
    t = _table()
    if t is None:
        return C.fail(NOT_READY)
    r = t.get(plan=plan, month=month)
    if r is not None:
        r.delete()
    return C.ok()


def delete_for_plan(plan):
    """Plans.delete_plan: a plan's numbers go with it."""
    t = _table()
    if t is None:
        return
    for r in t.search(plan=plan):
        r.delete()
