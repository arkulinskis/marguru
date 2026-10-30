"""Plans: a business profile (the answers from #build) plus the owner's progress through its playbook.

The playbook itself (stages and prompt texts) is built in the browser from the profile (web/pages/_library.html),
so the server only stores and checks the profile and the progress:
    progress = {"done": {prompt_id: iso}, "star": [prompt_id], "notes": {prompt_id: text}}
Only the owner (or an admin) can read or change a plan.
"""
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData

TYPES = {"food", "retail", "ecom", "trades", "health", "beauty", "fitness", "pro", "realestate", "creative", "software", "other"}
REACH = {"visit", "goto", "online", "both"}
GOALS = {"calls", "walkins", "sales", "leads", "awareness", "repeat"}
BUDGETS = {"0", "300", "1000", "3000", "more"}
REPEAT = {"once", "sometimes", "often"}
VOICES = {"warm", "premium", "bold", "expert"}
HAS = ("site", "gbp", "social", "email", "reviews", "photos")
TEXT_FIELDS = {"name": 80, "what": 200, "where": 120, "customer": 300, "edge": 300, "competitors": 200, "tried": 400, "site_url": 200}
MAX_PLANS = 20
PROMPT_ID = re.compile(r"^[a-z0-9_-]{1,40}$")


def clean_profile(p):
    """Browser answers -> a clean profile dict, or raises ValueError with a message for the user."""
    if not isinstance(p, dict):
        raise ValueError("Tell us about your business first.")
    out = {k: C.text(p.get(k), n) for k, n in TEXT_FIELDS.items()}
    if len(out["name"]) < 2:
        raise ValueError("What's your business called? (at least 2 characters)")
    if len(out["what"]) < 3:
        raise ValueError("Say what you sell, in a few words.")

    def pick(key, allowed, default):
        val = str(p.get(key) or "")
        return val if val in allowed else default
    out["type"] = pick("type", TYPES, "other")
    out["reach"] = pick("reach", REACH, "visit")
    out["goal"] = pick("goal", GOALS, "calls")
    out["budget"] = pick("budget", BUDGETS, "0")
    out["repeat"] = pick("repeat", REPEAT, "sometimes")
    out["voice"] = pick("voice", VOICES, "warm")
    try:
        price = float(p.get("price") or 0)
    except (TypeError, ValueError):
        price = 0
    out["price"] = int(round(price)) if 0 < price < 10_000_000 else 0
    has = p.get("has") if isinstance(p.get("has"), dict) else {}
    out["has"] = {k: True for k in HAS if has.get(k)}
    return out


def clean_progress(pr):
    pr = pr if isinstance(pr, dict) else {}
    done = pr.get("done") if isinstance(pr.get("done"), dict) else {}
    star = pr.get("star") if isinstance(pr.get("star"), list) else []
    notes = pr.get("notes") if isinstance(pr.get("notes"), dict) else {}
    return {"done": {k: C.text(v, 40) or C.iso(C.now()) for k, v in list(done.items())[:80] if PROMPT_ID.match(str(k))},
            "star": [s for s in star[:80] if isinstance(s, str) and PROMPT_ID.match(s)],
            "notes": {k: C.text(v, 2000, multiline=True) for k, v in list(notes.items())[:80] if PROMPT_ID.match(str(k)) and C.text(v, 10)}}


def _plan(r, full=True):
    pr = r["progress"] or {}
    d = {"id": r.get_id(), "name": r["name"], "type": (r["profile"] or {}).get("type", "other"),
         "created": C.iso(r["created"]), "updated": C.iso(r["updated"]), "done_ids": sorted((pr.get("done") or {}).keys())}
    if full:
        d["profile"] = r["profile"] or {}
        d["progress"] = {"done": pr.get("done") or {}, "star": pr.get("star") or [], "notes": pr.get("notes") or {}}
    return d


def _own(plan_id):
    """(user, row) when the caller may change this plan, else raises/returns (user, None)."""
    me = C.require_user()
    r = C.row_by_id(app_tables.plans, plan_id)
    if r is None or (r["owner"] != me and not C.is_admin(me)):
        return me, None
    return me, r


@anvil.server.callable(require_user=True)
def list_plans():
    me = C.require_user()
    rows = app_tables.plans.search(tables.order_by("updated", ascending=False), owner=me)
    return {"plans": [_plan(r, full=True) for r in rows]}


@anvil.server.callable(require_user=True)
def get_plan(plan_id):
    me, r = _own(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    return C.ok(plan=_plan(r))


@anvil.server.callable(require_user=True)
def save_plan(profile, plan_id=None, progress=None):
    """Create a plan (plan_id None) or update its profile. `progress` is only used when creating
    (to bring a plan made before signing in into the account)."""
    me = C.require_user()
    try:
        prof = clean_profile(profile)
    except ValueError as e:
        return C.fail(str(e))
    if plan_id:
        _, r = _own(plan_id)
        if r is None:
            return C.fail("That plan doesn't exist, or it isn't yours.")
        r.update(profile=prof, name=prof["name"], updated=C.now())
        return C.ok(plan=_plan(r))
    if len(app_tables.plans.search(owner=me)) >= MAX_PLANS:
        return C.fail("You have %d plans already. Delete one you don't use first." % MAX_PLANS)
    if C.rate_limited("save_plan", 30, 3600):
        return C.fail("That's a lot of new plans in one hour. Please try again later.")
    r = app_tables.plans.add_row(owner=me, name=prof["name"], profile=prof, progress=clean_progress(progress),
                                 created=C.now(), updated=C.now(), is_demo=False)
    return C.ok(plan=_plan(r))


@anvil.server.callable(require_user=True)
def delete_plan(plan_id):
    _, r = _own(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def set_step(plan_id, prompt_id, field, value):
    """field: "done" (bool), "star" (bool) or "note" (text). Returns the plan's progress."""
    _, r = _own(plan_id)
    if r is None:
        return C.fail("That plan doesn't exist, or it isn't yours.")
    if not isinstance(prompt_id, str) or not PROMPT_ID.match(prompt_id):
        return C.fail("Unknown step.")
    pr = clean_progress(r["progress"])
    if field == "done":
        if value:
            pr["done"][prompt_id] = C.iso(C.now())
        else:
            pr["done"].pop(prompt_id, None)
    elif field == "star":
        pr["star"] = [s for s in pr["star"] if s != prompt_id] + ([prompt_id] if value else [])
    elif field == "note":
        note = C.text(value, 2000, multiline=True)
        if note:
            pr["notes"][prompt_id] = note
        else:
            pr["notes"].pop(prompt_id, None)
    else:
        return C.fail("Unknown change.")
    r.update(progress=pr, updated=C.now())
    return C.ok(progress=pr)


@anvil.server.callable(require_user=True)
def get_desk():
    """The signed-in home page: your plans and the latest wins, in one call."""
    me = C.require_user()
    DemoData.ensure_loaded()
    from . import Wins
    rows = app_tables.plans.search(tables.order_by("updated", ascending=False), owner=me)
    wins = [w for w in app_tables.wins.search(tables.order_by("created", ascending=False)) if not w["hidden"]][:3]
    return {"plans": [_plan(r) for r in rows], "wins": [Wins.win_dict(w, me) for w in wins]}
