"""Python side of the playbook engine (theme/assets/mg.js, window.MG). The prompts, stages, tips and the rules for
which prompts a business gets stay in JavaScript, unchanged from the JS version (their facts are source-checked:
never edit them without checking a primary source). Everything here passes JSON text, so pages get plain dicts.

    mg.DATA                 TYPES, REACH, GOALS, BUDGETS, REPEAT, VOICES, HAS, CHANNELS, STAGES, TIPS, EXAMPLE, BLANK
    mg.build(profile)       {v, stages: [{id, n, title, icon, role, agency, prompts: [...]}], prompts, first, hidden}
    mg.count(profile)       {prompts, stages}
    mg.label(list, id)      the label of a choice ("food" -> "Restaurant, café or bar")
    mg.tip_of_day()         [text, source]
    mg.blank()              an empty profile (the form's defaults)
    mg.store_get/store_set  this browser's storage as real dicts (same keys as the JS version: guestPlan, stage.*, math)
    mg.instructions(p)      "Set up your AI once": the custom instructions text (Sound like you, 2026-11-20)
    mg.followups(p)         [{id, label, text}]: the "Answer not right?" follow-ups on every prompt card
    mg.weeks(p, pr, start)  Your week: {weeks: [{n, start, range, items, mins, cap, now, past}], current, hours, cycle, left}
    mg.ics(p, url)          downloads the weekly calendar reminder (.ics, 12 weeks)
"""
import datetime
import json

import anvil.js
from anvil.js import window

DATA: dict = json.loads(window.MG.json.data())
KEY = "marguru."  # UI.config.key in app-kit.js


def build(profile):
    return json.loads(window.MG.json.build(json.dumps(profile or {})))


def count(profile):
    return json.loads(window.MG.json.count(json.dumps(profile or {})))


def stage_counts(profile):
    """{prompts, stages: [{title, n}]}: the live counter on #build (lighter than build())."""
    return json.loads(window.MG.json.stages(json.dumps(profile or {})))


def info(prompt_id):
    """{id, title, stage} of a prompt, or None (admin's prompt stats)."""
    return json.loads(window.MG.json.info(prompt_id))


def label(list_name, value):
    for row in DATA[list_name]:
        if row[0] == value:
            return row[1]
    return ""


def stage_title(stage_id):
    for s in DATA["STAGES"]:
        if s["id"] == stage_id:
            return s["title"]
    return ""


def blank():
    return json.loads(json.dumps(DATA["BLANK"]))


def example():
    p = blank()
    p.update(json.loads(json.dumps(DATA["EXAMPLE"])))
    return p


def tip_of_day():
    d = datetime.date.today()  # same pick as the JS version: year * 400 + month (0-based) * 31 + day
    tips = DATA["TIPS"]
    return tips[(d.year * 400 + (d.month - 1) * 31 + d.day) % len(tips)]


def open_url(where, text):
    q = str(window.encodeURIComponent(text))
    return ("https://claude.ai/new?q=" if where == "claude" else "https://chatgpt.com/?q=") + q


def copy(text):
    """Copy to the clipboard (waits for the browser's answer). True if it worked."""
    try:
        return bool(window.MG.copy(text))
    except Exception:
        return False


def copy_soon(text):
    """Copy without waiting (inside a link's click, which must go on opening the link)."""
    try:
        window.MG.copy(text)
    except Exception:
        pass


def instructions(profile):
    return str(window.MG.json.instructions(json.dumps(profile or {})))


def followups(profile):
    return json.loads(window.MG.json.followups(json.dumps(profile or {})))


def weeks(profile, progress, start_iso):
    return json.loads(window.MG.json.weeks(json.dumps(profile or {}), json.dumps(progress or {}), start_iso or ""))


def ics(profile, url):
    window.MG.json.ics(json.dumps(profile or {}), url)


def plan_url(kind, plan_id=None):
    """The address of a plan, for the calendar reminder (#plan/<id>, #plan/local or #plan/example)."""
    loc = window.location
    arg = plan_id if kind == "server" else kind
    return str(loc.origin) + str(loc.pathname) + "#plan/" + str(window.encodeURIComponent(str(arg)))


def download(profile, progress):
    window.MG.json.download(json.dumps(profile), json.dumps(progress or {}))


def confetti(component_or_node=None):
    node = component_or_node
    if node is not None and not hasattr(node, "getBoundingClientRect"):
        node = anvil.js.get_dom_node(node)
    window.MG.confetti(node)


def store_get(key, default=None):
    try:
        raw = window.localStorage.getItem(KEY + key)
    except Exception:
        return default
    if raw is None:
        return default
    try:
        v = json.loads(str(raw))
    except Exception:
        return default
    return default if v is None else v


def store_set(key, value):
    try:
        window.localStorage.setItem(KEY + key, json.dumps(value))
    except Exception:
        pass


def now_iso():
    return datetime.datetime.utcnow().isoformat()[:23] + "Z"  # Skulpt has no datetime.timezone
