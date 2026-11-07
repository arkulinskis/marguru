"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python -I tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app", ignore=shutil.ignore_patterns("__pycache__"))
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- plans
PROFILE = {"name": "Crumb & Co.", "what": "sourdough bread and cakes", "type": "food", "reach": "visit", "where": "Verdun",
           "customer": "families", "price": "18", "repeat": "often", "goal": "walkins", "budget": "300", "voice": "warm",
           "has": {"site": True, "gbp": True, "bogus": True}, "edge": "baked at 5am", "evil": "x"}
as_user(None)
assert denied("list_plans") and denied("save_plan", PROFILE) and denied("get_desk")
as_user(ana)
assert call("list_plans")["plans"] == []
bad(call("save_plan", {"name": "X", "what": "bread"}), "name too short")
bad(call("save_plan", {"name": "Crumb", "what": ""}), "what is required")
bad(call("save_plan", "not a dict"))
plan = ok(call("save_plan", PROFILE))["plan"]
prof = plan["profile"]
assert prof["price"] == 18 and prof["has"] == {"site": True, "gbp": True} and "evil" not in prof and prof["type"] == "food"
odd_plan = ok(call("save_plan", dict(PROFILE, type="spaceship", budget="9999", price="-5", name="Odd one")))["plan"]
odd = odd_plan["profile"]
assert odd["type"] == "other" and odd["budget"] == "0" and odd["price"] == 0, "unknown choices fall back to safe defaults"
pid = plan["id"]
assert call("get_plan", pid)["plan"]["name"] == "Crumb & Co."
pr = ok(call("set_step", pid, "gbp", "done", True))["progress"]
assert "gbp" in pr["done"]
ok(call("set_step", pid, "gbp", "star", True))
pr = ok(call("set_step", pid, "gbp", "note", "  Added 4 categories  "))["progress"]
assert pr["notes"]["gbp"] == "Added 4 categories" and pr["star"] == ["gbp"]
pr = ok(call("set_step", pid, "gbp", "done", False))["progress"]
assert "gbp" not in pr["done"]
ok(call("set_step", pid, "gbp", "note", ""))
assert "gbp" not in call("get_plan", pid)["plan"]["progress"]["notes"]
bad(call("set_step", pid, "../evil", "done", True))
bad(call("set_step", pid, "gbp", "explode", True))
upd = ok(call("save_plan", dict(PROFILE, name="Crumb & Co. Bakery"), pid))["plan"]
assert upd["id"] == pid and upd["name"] == "Crumb & Co. Bakery"
imported = ok(call("save_plan", dict(PROFILE, name="From guest"), None, {"done": {"brief": "2026-01-01", "BAD ID": "x"}, "star": ["offer", 5], "notes": {"brief": "hi"}}))["plan"]
assert list(imported["progress"]["done"]) == ["brief"] and imported["progress"]["star"] == ["offer"] and imported["progress"]["notes"] == {"brief": "hi"}
assert len(call("list_plans")["plans"]) == 3
as_user(bob)
bad(call("get_plan", pid), "someone else's plan")
bad(call("set_step", pid, "gbp", "done", True))
bad(call("save_plan", PROFILE, pid))
bad(call("delete_plan", pid))
bad(call("get_plan", "nonsense"))
assert call("list_plans")["plans"] == []
as_user(ana)
ok(call("delete_plan", imported["id"]))
ok(call("delete_plan", odd_plan["id"]))
assert len(call("list_plans")["plans"]) == 1

# ---------------------------------------------------------------------------------- wins + demo data
as_user(None)
wins = call("list_wins")["wins"]
assert M["DemoData"].state() == "loaded" and len(wins) == len(M["DemoData"].DEMO_WINS), "demo loads on first visit"
assert all(w["demo"] and not w["can_delete"] and not w["clapped"] for w in wins)
assert "@" not in json.dumps(wins), "wins never show emails"
assert len(call("list_wins", "maps")["wins"]) == 3
assert denied("post_win", {}) and denied("clap_win", wins[0]["id"])
as_user(ana)
bad(call("post_win", {"title": "Hi", "story": "Short"}))
bad(call("post_win", {"title": "A good title", "story": "too short"}))
w = ok(call("post_win", {"title": "Reviews doubled", "story": "Asked every customer at the counter for a review.", "result": "2x reviews",
                          "channel": "maps", "business_type": "food"}))["win"]
assert w["mine"] and w["can_delete"] and w["channel"] == "maps" and w["author"] == "Ana"
w2 = ok(call("post_win", {"title": "Odd channel", "story": "Something that worked for us, honestly.", "channel": "telepathy", "business_type": "x"}))["win"]
assert w2["channel"] == "other" and w2["business_type"] == "other"
c = ok(call("clap_win", wins[0]["id"]))["win"]
assert c["clapped"] and c["claps"] == wins[0]["claps"] + 1
c = ok(call("clap_win", wins[0]["id"]))["win"]
assert not c["clapped"] and c["claps"] == wins[0]["claps"], "clapping again takes it back"
desk = call("get_desk")
assert len(desk["plans"]) == 1 and len(desk["wins"]) == 3 and {"Reviews doubled", "Odd channel"} <= {x["title"] for x in desk["wins"]}
as_user(bob)
bad(call("delete_win", w["id"]), "can't delete someone else's win")
assert denied("set_win_hidden", w["id"], True)
as_user(admin)
ok(call("set_win_hidden", w["id"], True))
as_user(bob)
assert w["id"] not in [x["id"] for x in call("list_wins")["wins"]], "hidden wins are hidden"
bad(call("clap_win", w["id"]))
as_user(admin)
assert w["id"] in [x["id"] for x in call("list_wins")["wins"]], "admins still see hidden wins"
bad(call("set_win_hidden", "nope", True))
ok(call("delete_win", w2["id"]), "admins can delete anything")
as_user(ana)
ok(call("delete_win", w["id"]))
assert call("delete_win", w["id"])["ok"], "deleting twice is fine"

# ---------------------------------------------------------------------------------- prompt stats
as_user(None)
ok(call("track_copy", "gbp"))
ok(call("track_copy", "gbp"))
ok(call("track_copy", "rsa"))
bad(call("track_copy", "<script>"))
bad(call("track_copy", None))
assert denied("admin_prompt_stats")
as_user(ana)
assert denied("admin_prompt_stats")
as_user(admin)
st = call("admin_prompt_stats")
assert st["total"] == 3 and st["prompts"][0] == {"id": "gbp", "copies": 2, "last": st["prompts"][0]["last"]}

# ---------------------------------------------------------------------------------- admin overview + demo removal
ov = call("admin_overview")
assert ov["plans"] == 1 and ov["wins"] == 0 and ov["copies"] == 3
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and call("list_wins")["wins"] == [] and not T.users.search(is_demo=True)
as_user(None)
call("list_wins")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert len(call("list_wins")["wins"]) == len(M["DemoData"].DEMO_WINS), "reloading replaces the demo instead of doubling it"
as_user(ana)
assert len(call("list_plans")["plans"]) == 1, "demo reloads leave real plans alone"

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "list_wins", "track_copy", "legal_state", "legal_accept"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
