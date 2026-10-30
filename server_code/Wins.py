"""Wins: a public board where owners share a marketing move that worked. Anyone can read; members post,
clap ("this helped") and delete their own; admins hide or delete anything.
Authors are shown by display name only (never their email)."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData
from .Plans import TYPES

CHANNELS = {"maps", "site", "seo", "gads", "social", "content", "email", "other"}


def win_dict(r, me):
    clappers = r["clappers"] or []
    mine = me is not None and r["author"] == me
    return {"id": r.get_id(), "author": C.name_of(r["author"]), "business_type": r["business_type"] or "other",
            "channel": r["channel"] or "other", "title": r["title"], "story": r["story"] or "", "result": r["result"] or "",
            "created": C.iso(r["created"]), "claps": len(clappers), "clapped": me is not None and me.get_id() in clappers,
            "demo": bool(r["is_demo"]), "hidden": bool(r["hidden"]), "mine": mine,
            "can_delete": mine or C.is_admin(me)}


@anvil.server.callable
def list_wins(channel=None):
    DemoData.ensure_loaded()
    me = C.me()
    admin = C.is_admin(me)
    rows = app_tables.wins.search(tables.order_by("created", ascending=False))
    out = [win_dict(r, me) for r in rows if (admin or not r["hidden"]) and (not channel or r["channel"] == channel)]
    return {"wins": out[:200]}


@anvil.server.callable(require_user=True)
def post_win(data):
    me = C.require_user()
    data = data if isinstance(data, dict) else {}
    title = C.text(data.get("title"), 120)
    story = C.text(data.get("story"), 1500, multiline=True)
    result = C.text(data.get("result"), 200)
    if len(title) < 5:
        return C.fail("Give your win a short title (at least 5 characters).")
    if len(story) < 20:
        return C.fail("Tell people what you did, in a few sentences (at least 20 characters).")
    if C.rate_limited("post_win", 5, 3600):
        return C.fail("That's a lot of wins in one hour. Please try again later.")
    channel = data.get("channel") if data.get("channel") in CHANNELS else "other"
    btype = data.get("business_type") if data.get("business_type") in TYPES else "other"
    r = app_tables.wins.add_row(author=me, business_type=btype, channel=channel, title=title, story=story, result=result,
                                created=C.now(), clappers=[], hidden=False, is_demo=False)
    return C.ok(win=win_dict(r, me))


@anvil.server.callable(require_user=True)
def clap_win(win_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.wins, win_id)
    if r is None or (r["hidden"] and not C.is_admin(me)):
        return C.fail("That win is no longer here.")
    clappers = list(r["clappers"] or [])
    uid = me.get_id()
    clappers = [c for c in clappers if c != uid] if uid in clappers else clappers + [uid]
    r["clappers"] = clappers
    return C.ok(win=win_dict(r, me))


@anvil.server.callable(require_user=True)
def delete_win(win_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.wins, win_id)
    if r is None:
        return C.ok()
    if r["author"] != me and not C.is_admin(me):
        return C.fail("You can only delete your own wins.")
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def set_win_hidden(win_id, flag):
    me = C.require_admin()
    r = C.row_by_id(app_tables.wins, win_id)
    if r is None:
        return C.fail("That win is no longer here.")
    r["hidden"] = bool(flag)
    return C.ok(win=win_dict(r, me))
