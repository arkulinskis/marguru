from anvil import *
import datetime

import anvil.server

from ._anvil_designer import ScoresTemplate
from ... import mg, router, state

# key, label, hint, unit. "reviews" only for local businesses, "spend" only with an ad budget (or when already filled in).
FIELDS = [
    ("calls", "Calls & bookings", "", ""),
    ("enquiries", "Enquiries", "forms, messages, emails", ""),
    ("customers", "New customers", "", ""),
    ("sales", "Sales", "in dollars", "$"),
    ("reviews", "New Google reviews", "", ""),
    ("spend", "Ad spend", "in dollars", "$"),
]
LABELS = {k: label for k, label, _, _ in FIELDS}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
LOCAL_KEY = "scores.local"  # localStorage marguru.scores.local: {month: {numbers, note, updated}}


def _shift(month, n):
    """"2026-11", -1 -> "2026-10"."""
    y, m = int(month[:4]), int(month[5:7])
    i = y * 12 + (m - 1) + n
    return "%04d-%02d" % (i // 12, i % 12 + 1)


def _this_month():
    d = datetime.date.today()
    return "%04d-%02d" % (d.year, d.month)


def _label(month):
    return "%s %s" % (MONTHS[int(month[5:7]) - 1], month[:4])


def _num(v):
    """"12", 12, "12.5" -> 12 / 12.5; blank -> None; junk or negative -> raises ValueError."""
    if v is None or str(v).strip() == "":
        return None
    n = float(str(v).strip())
    if n != n or n < 0 or n > 1000000000:
        raise ValueError(v)
    return int(n) if n == int(n) else round(n, 2)


def _fmt(n, unit=""):
    """1234.5 -> "1,234.5", with "$" in front for money."""
    if n is None:
        return ""
    whole = int(n)
    frac = n - whole
    s = str(whole)
    groups = []
    while len(s) > 3:
        groups.insert(0, s[-3:])
        s = s[:-3]
    groups.insert(0, s)
    out = ",".join(groups)
    if frac:
        out += ("%.2f" % frac)[1:]
    return unit + out


def _example_scores():
    """Three labelled months for the example bakery (the three months before this one)."""
    now = _this_month()
    rows = [(_shift(now, -3), {"calls": 21, "enquiries": 9, "customers": 64, "sales": 9800, "reviews": 3, "spend": 240},
             "Example: started replying to every Google review."),
            (_shift(now, -2), {"calls": 26, "enquiries": 14, "customers": 77, "sales": 11200, "reviews": 7, "spend": 280},
             "Example: asked every cake customer for a review; 4 Instagram reels."),
            (_shift(now, -1), {"calls": 31, "enquiries": 12, "customers": 85, "sales": 12650, "reviews": 5, "spend": 300},
             "Example: window sign for Saturday loaves; first Google Ads month.")]
    return {m: {"numbers": nums, "note": note, "updated": ""} for m, nums, note in rows}


class Scores(ScoresTemplate):
    """#numbers/<plan id>, #numbers/local, #numbers/example ("Did it work?", 2026-11-20): monthly numbers for a plan.
    Pick a month, fill in calls/bookings, enquiries, new customers, sales, reviews (local businesses), ad spend (with a
    budget) and what you did. Below: the last 6 saved months with arrows and cost per lead / customer (plain division).
    "Copy for your monthly report" copies the plan's `report` prompt with this month's and last month's numbers.
    Sources: a saved plan (server: Scores.py list_scores / save_score / delete_score), the guest plan (localStorage
    marguru.scores.local), the example (three built-in months, kept in memory). The router sends #numbers/<id> to
    sign-in for visitors, and #numbers/local to #build when this browser has no plan."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        arg = args[0] if args else "local"
        self.kind = "example" if arg == "example" else "local" if arg == "local" else "server"
        self.plan_id = arg if self.kind == "server" else None
        self.error_label.visible = False
        self.scores: dict = {}
        state.set_control_attr(self.note_box, "maxlength", 500)
        self.note_box.height = "84"
        state.live(self.error_label)
        state.live(self.report_note)
        profile = None
        if self.kind == "example":
            profile = mg.example()
            self.scores = _example_scores()
        elif self.kind == "local":
            g = mg.store_get("guestPlan") or {}
            profile = g.get("profile")
            self.scores = mg.store_get(LOCAL_KEY) or {}
            if not isinstance(self.scores, dict):
                self.scores = {}
        else:
            r = anvil.server.call("get_plan", self.plan_id)
            if isinstance(r, dict) and r.get("ok"):
                profile = r["plan"]["profile"]
                s = anvil.server.call("list_scores", self.plan_id)
                if isinstance(s, dict) and s.get("ok"):
                    self.scores = {x["month"]: x for x in s["scores"]}
                else:
                    self._error((s or {}).get("error") if isinstance(s, dict) else None)
        if not profile:
            self.main_part.visible = False
            return
        self.missing.visible = False
        self.profile = profile
        self.example_banner.visible = self.kind == "example"
        self.local_banner.visible = self.kind == "local"
        state.set_attr(self.back_link, "href", router.href("plan", self.plan_id if self.kind == "server" else self.kind))
        self.lead.text = ("%s: your monthly numbers. Fill in a month, watch the arrows, and paste both months into your "
                          "monthly report prompt." % (profile.get("name") or "Your business"))
        self.delete_button.visible = False
        self.month_dd.add_event_handler("change", self._month_changed)
        last = _shift(_this_month(), -1)
        self.month = last if last not in self.scores else _this_month()
        self._months()
        self._load_month()
        self._history()

    # ---- helpers
    def _error(self, msg):
        self.error_label.text = msg or "Couldn't load your numbers. Please try again."
        self.error_label.visible = True
        self.save_button.enabled = False

    def _fields(self):
        """Which numbers this business tracks: reviews for local ones, spend with an ad budget (or already filled in)."""
        local = (self.profile.get("reach") or "visit") != "online"
        paid = str(self.profile.get("budget") or "0") != "0"
        used = set()
        for s in self.scores.values():
            used.update(k for k, v in ((s or {}).get("numbers") or {}).items() if v is not None)
        return [f for f in FIELDS if (f[0] != "reviews" or local or "reviews" in used) and (f[0] != "spend" or paid or "spend" in used)]

    def _months(self):
        now = _this_month()
        months = [_shift(now, -i) for i in range(12)]
        months += sorted([m for m in self.scores if m not in months], reverse=True)
        if self.month not in months:
            months.append(self.month)
        self.month_dd.items = [(_label(m) + (" (saved)" if m in self.scores else ""), m) for m in months]
        self.month_dd.selected_value = self.month
        state.set_control_attr(self.month_dd, "aria-label", "Month")

    def _load_month(self):
        s = self.scores.get(self.month) or {}
        nums = s.get("numbers") or {}
        self.fields_panel.items = [{"key": k, "label": label, "hint": hint, "unit": unit, "value": nums.get(k)}
                                   for k, label, hint, unit in self._fields()]
        self.note_box.text = s.get("note") or ""
        self.delete_button.visible = self.month in self.scores
        self.save_button.text = "Save changes" if self.month in self.scores else "Save this month"
        self._report_note()

    def _read(self):
        """{key: number} from the fields, or None (and a message) when something isn't a number."""
        out = {}
        for c in self.fields_panel.get_components():
            key = c.item["key"]
            try:
                n = _num(c.value())
            except ValueError:
                state.toast("%s: use a number of 0 or more." % LABELS[key], "error")
                c.dom_nodes["num"].classList.add("bad")
                c.dom_nodes["num"].focus()
                return None
            if n is not None:
                out[key] = n
        return out

    def _cells(self, nums, prev):
        """One month's cells for Items/ScoreRow: value, arrow against the previous saved month, cost per lead/customer."""
        cells = {}
        for k, label, _, unit in FIELDS:
            v = nums.get(k)
            if v is None:
                continue
            c = {"text": _fmt(v, unit)}
            p = (prev or {}).get(k)
            if p is not None:
                diff = v - p
                if diff > 0:
                    c["arrow"], c["tone"] = "▲ " + _fmt(diff, unit), "neutral" if k == "spend" else "up"
                elif diff < 0:
                    c["arrow"], c["tone"] = "▼ " + _fmt(-diff, unit), "neutral" if k == "spend" else "down"
                else:
                    c["arrow"], c["tone"] = "=", "same"
            cells[k] = c
        spend = nums.get("spend")
        leads = (nums.get("calls") or 0) + (nums.get("enquiries") or 0)
        if spend:
            if leads:
                cells["cpl"] = {"text": _fmt(round(spend / leads, 2), "$")}
            if nums.get("customers"):
                cells["cpc"] = {"text": _fmt(round(spend / nums["customers"], 2), "$")}
        return cells

    def _history(self):
        months = sorted(self.scores.keys(), reverse=True)
        rows = []
        for i, m in enumerate(months[:6]):
            prev_m = months[i + 1] if i + 1 < len(months) else None
            prev = (self.scores[prev_m].get("numbers") or {}) if prev_m else None
            cells = self._cells(self.scores[m].get("numbers") or {}, prev)
            if prev_m:
                for c in cells.values():
                    if c.get("arrow"):
                        c["title"] = "Compared with " + _label(prev_m)
            rows.append({"month": m, "label": _label(m), "latest": i == 0, "cells": cells,
                         "note": self.scores[m].get("note") or "", "host": self})
        self.rows_panel.items = rows
        self.empty_part.visible = not rows

    def _report_note(self):
        prev = _shift(self.month, -1)
        if prev in self.scores:
            self.report_note.text = "Uses %s and %s." % (_label(self.month), _label(prev))
        else:
            self.report_note.text = "Uses %s. %s has no numbers yet, so the AI can't compare months." % (
                _label(self.month), _label(prev))

    def _persist_local(self):
        if self.kind == "local":
            mg.store_set(LOCAL_KEY, self.scores)

    # ---- events
    def pick_month(self, month):
        """ScoreRow's Edit: load that month into the form."""
        self.month = month
        self._months()
        self._load_month()
        state.focus(self.month_dd)
        state.toast("Editing %s." % _label(month))

    def _month_changed(self, **event_args):
        self.month = self.month_dd.selected_value or _this_month()
        self._load_month()

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        nums = self._read()
        if nums is None:
            return
        note = (self.note_box.text or "").strip()[:500]
        if not nums and not note:
            state.toast("Fill in at least one number first.", "error")
            return
        if self.kind == "server":
            r = state.call("save_score", self.plan_id, self.month, nums, note)
            if not r:
                return
            self.scores[self.month] = r["score"]
            state.toast("Saved %s." % _label(self.month), "ok")
        else:
            self.scores[self.month] = {"month": self.month, "numbers": nums, "note": note, "updated": mg.now_iso()}
            self._persist_local()
            state.toast("Saved %s in this browser." % _label(self.month) if self.kind == "local"
                        else "Changed for this visit (the example isn't saved).", "ok")
        self._months()
        self._load_month()
        self._history()

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if self.month not in self.scores:
            return
        if not confirm("Its numbers and note go. This can't be undone.", title="Delete %s?" % _label(self.month),
                       buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            return
        if self.kind == "server":
            if state.call("delete_score", self.plan_id, self.month) is None:
                return
        self.scores.pop(self.month, None)
        self._persist_local()
        state.toast("Deleted %s." % _label(self.month))
        self._months()
        self._load_month()
        self._history()

    @handle("report_button", "click")
    def report_button_click(self, **event_args):
        nums = self._read()
        if nums is None:
            return
        book = mg.build(self.profile)
        report = [p for p in book["prompts"] if p["id"] == "report"]
        if not report:
            state.toast("Couldn't find the report prompt in this playbook.", "error")
            return
        prev = _shift(self.month, -1)
        old = (self.scores.get(prev) or {})
        lines = [report[0]["text"].rstrip(), "", "MY NUMBERS"]
        lines += self._block("THIS MONTH", self.month, nums, (self.note_box.text or "").strip())
        lines += [""]
        if old:
            lines += self._block("LAST MONTH", prev, old.get("numbers") or {}, old.get("note") or "")
        else:
            lines += ["LAST MONTH (%s): no numbers saved." % _label(prev)]
        lines += ["", "Skip STEP 1. Use these numbers and write the STEP 2 summary now."]
        ok = mg.copy("\n".join(lines))
        state.toast("Copied. Paste it into ChatGPT or Claude." if ok else "Couldn't copy here. Please try again.",
                    "ok" if ok else "error")
        if ok and self.kind != "example":
            try:
                state.call_quiet("track_copy", "report")
            except Exception:
                pass

    def _block(self, title, month, nums, note):
        out = ["%s (%s)" % (title, _label(month))]
        for k, label, _, unit in self._fields():
            if nums.get(k) is not None:
                out.append("- %s: %s" % (label, _fmt(nums[k], unit)))
        spend = nums.get("spend")
        leads = (nums.get("calls") or 0) + (nums.get("enquiries") or 0)
        if spend and leads:
            out.append("- Cost per lead (ad spend / calls and enquiries): %s" % _fmt(round(spend / leads, 2), "$"))
        if spend and nums.get("customers"):
            out.append("- Cost per new customer: %s" % _fmt(round(spend / nums["customers"], 2), "$"))
        if len(out) == 1:
            out.append("- (no numbers)")
        if note:
            out.append("- What we did: " + note.replace("\n", " "))
        return out
