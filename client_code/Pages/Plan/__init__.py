from anvil import *
import datetime

import anvil.js
import anvil.server

from ._anvil_designer import PlanTemplate
from ... import mg, router, state

EXAMPLE_PROGRESS = {"done": {"brief": "1", "customer": "1"}, "star": ["gbp"], "notes": {}}


def _clean(pr):
    pr = pr if isinstance(pr, dict) else {}
    return {"done": dict(pr.get("done") or {}), "star": list(pr.get("star") or []), "notes": dict(pr.get("notes") or {})}


class Plan(PlanTemplate):
    """#plan/<id>, #plan/local, #plan/example: the playbook, built in the browser from the profile (mg.build).
    Three sources: a saved plan (server: get_plan / set_step), the guest plan in this browser (mg store 'guestPlan'),
    or the built-in example (progress kept in memory). Binder tabs = the 8 stages; each prompt card (Items/PromptCard)
    can be copied, opened in ChatGPT / Claude (copied too), starred, noted and ticked done. The router sends
    #plan/<id> to sign-in for visitors, and #plan/local to #build when this browser has no plan.
    2026-11-20: "Set up your AI once" (mg.instructions), follow-up chips on each card (self.followups),
    "By stage | By week" (mg.weeks: 12 weeks that fit the profile's hours, Items/WeekCard + .ics reminder) and links to
    #numbers (Pages/Scores)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        arg = args[0] if args else "local"
        self.kind = "example" if arg == "example" else "local" if arg == "local" else "server"
        state.heading(self.name_title, 1)
        state.heading(self.stage_title, 2)
        state.set_control_attr(self.delete_button, "aria-label", "Delete this plan")
        self.next_panel.add_event_handler("x-jump", self._jump)
        self.tabs_panel.add_event_handler("x-stage", self._tab)
        self.plan: dict = {}
        self.start = ""
        self.setup_open = False
        if self.kind == "example":
            self.plan = {"id": None, "profile": mg.example(), "progress": _clean(EXAMPLE_PROGRESS)}
            # the example started last week, so "This week" is week 2
            self.start = (datetime.datetime.utcnow() - datetime.timedelta(days=7)).isoformat()[:19] + "Z"
        elif self.kind == "local":
            g = mg.store_get("guestPlan") or {}
            self.plan = {"id": None, "profile": g.get("profile") or mg.blank(), "progress": _clean(g.get("progress"))}
            self.start = g.get("created") or g.get("updated") or ""
        else:
            r = anvil.server.call("get_plan", arg)
            if not isinstance(r, dict) or not r.get("ok"):
                self.book_part.visible = False
                return
            self.plan = r["plan"]
            self.plan["progress"] = _clean(self.plan.get("progress"))
            self.start = self.plan.get("created") or ""
        self.missing.visible = False
        self.stage = mg.store_get("stage." + (self.plan.get("id") or self.kind))
        self.view = mg.store_get("view." + (self.plan.get("id") or self.kind)) or "stage"
        self.draw()

    # ---- progress (the cards read and change it through these)
    def progress(self):
        return self.plan["progress"]

    def persist(self, pid, field, value):
        pr = self.progress()
        if field == "done":
            if value:
                pr["done"][pid] = mg.now_iso()
            else:
                pr["done"].pop(pid, None)
        elif field == "star":
            pr["star"] = [s for s in pr["star"] if s != pid] + ([pid] if value else [])
        elif field == "note":
            if value:
                pr["notes"][pid] = value
            else:
                pr["notes"].pop(pid, None)
        if self.kind == "local":
            g = mg.store_get("guestPlan") or {}
            g["progress"] = pr
            mg.store_set("guestPlan", g)
        elif self.kind == "server":
            state.call_quiet("set_step", self.plan["id"], pid, field, value)

    def track(self, pid):
        """Anonymous count of copied prompts (admin -> Prompts)."""
        try:
            state.call_quiet("track_copy", pid)
        except Exception:
            pass

    def step_done(self, card, on):
        if on:
            s = self._stage()
            d = self.progress()["done"]
            if all(p["id"] in d for p in s["prompts"]):
                mg.confetti(card.stamp_node())
                state.toast("Stage %d, %s, complete. Nice work!" % (s["n"], s["title"]), "ok")
        self._progress_bar()
        self._tabs()

    # ---- drawing
    def _stage(self):
        for s in self.book["stages"]:
            if s["id"] == self.stage:
                return s
        return self.book["stages"][0]

    def draw(self):
        self.book = mg.build(self.plan["profile"])
        self.followups = mg.followups(self.plan["profile"])
        if not any(s["id"] == self.stage for s in self.book["stages"]):
            self.stage = self.book["stages"][0]["id"]
        pf = self.plan["profile"]
        example, local = self.kind == "example", self.kind == "local"
        self.name_title.text = pf.get("name") or ""
        self.subtitle.text = "Marketing playbook, an example" if example else "Marketing playbook"
        self.type_badge.text = mg.label("TYPES", pf.get("type")) or "Business"
        self.where_badge.visible = bool(pf.get("where"))
        self.dom_nodes["where_t"].textContent = pf.get("where") or ""
        self.goal_badge.text = mg.label("GOALS", pf.get("goal"))
        self.budget_badge.text = "Ads: " + mg.label("BUDGETS", pf.get("budget"))
        self.mine_link.visible = example
        self.edit_link.visible = not example
        state.set_attr(self.edit_link, "href", router.href("build", "local" if local else self.plan.get("id")))
        self.delete_button.visible = self.kind == "server"
        self.local_banner.visible = local
        self.example_banner.visible = example
        num = router.href("numbers", self.plan.get("id") if self.kind == "server" else self.kind)
        state.set_attr(self.numbers_link, "href", num)
        state.set_attr(self.numbers_link2, "href", num)
        self._setup()
        self._progress_bar()
        nxt = self._next_up()
        self.next_part.visible = bool(nxt)
        self.all_done.visible = not nxt
        self.next_panel.items = [{"id": p["id"], "k": ("Next up" if i == 0 else "Then") + " · " + p["time"], "title": p["title"],
                                  "stage": mg.stage_title(p["stage"])} for i, p in enumerate(nxt)]
        self._tabs()
        self._sheet()
        self._show_view()

    # ---- Set up your AI once
    def _setup(self):
        text = mg.instructions(self.plan["profile"])
        self.ai_text = text
        self.dom_nodes["setup_pre"].textContent = text
        n = len(text)
        self.setup_count.text = ("%d characters. Free ChatGPT accounts save up to 1,500; paid plans up to 5,000. %s" % (
            n, "Too long for a free account? Remove the sample from the end." if n > 1500 else "This fits."))
        self._setup_draw()

    def _setup_draw(self):
        btn = self.dom_nodes["setup_show"]
        btn.textContent = "Hide them" if self.setup_open else "See them"
        btn.setAttribute("aria-expanded", "true" if self.setup_open else "false")
        self.dom_nodes["setup_pre"].style.display = "" if self.setup_open else "none"

    def setup_show_click(self, event):
        self.setup_open = not self.setup_open
        self._setup_draw()

    @handle("copy_ai_button", "click")
    def copy_ai_button_click(self, **event_args):
        ok = mg.copy(self.ai_text)
        state.toast("Copied. Paste it into ChatGPT's Custom instructions or a Project's instructions." if ok
                    else "Couldn't copy: press See them, select the text and copy it by hand.", "ok" if ok else "error")

    # ---- By stage | By week
    def _show_view(self):
        week = self.view == "week"
        self.stage_part.visible = not week
        self.week_part.visible = week
        for node, on in ((self.dom_nodes["by_stage"], not week), (self.dom_nodes["by_week"], week)):
            node.classList.toggle("on", on)
            node.setAttribute("aria-pressed", "true" if on else "false")
        if week:
            self._weeks()

    def _set_view(self, view):
        if view == self.view:
            return
        self.view = view
        mg.store_set("view." + (self.plan.get("id") or self.kind), view)
        self._show_view()

    def by_stage_click(self, event):
        self._set_view("stage")

    def by_week_click(self, event):
        self._set_view("week")

    def _weeks(self):
        wk = mg.weeks(self.plan["profile"], self.progress(), self.start)
        h = wk["hours"]
        lead = "Planned for about %s a week, the most useful prompts first. Ticked prompts drop out; weekly and monthly ones come back." % (
            "1 hour" if h == 1 else "%d hours" % h)
        if wk["cycle"] > 1:
            lead += " Round %d: a new 12 weeks started this week." % wk["cycle"]
        if wk["left"]:
            lead += " %s don't fit yet: more hours (Edit details) or the next round." % state.plural(wk["left"], "prompt")
        self.weeks_lead.text = lead
        self.weeks_panel.items = [{"w": w, "host": self} for w in wk["weeks"]]

    def jump_to(self, pid):
        """A task in the week view: open its card in the stage view."""
        self._set_view("stage")
        self._jump(pid)

    @handle("ics_button", "click")
    def ics_button_click(self, **event_args):
        mg.ics(self.plan["profile"], mg.plan_url(self.kind, self.plan.get("id")))
        state.toast("Downloaded. Open the file to add the weekly reminder to your calendar.", "ok")

    def _progress_bar(self):
        total = len(self.book["prompts"])
        d = self.progress()["done"]
        done = len([p for p in self.book["prompts"] if p["id"] in d])
        self.done_n.text = str(done)
        self.total_line.text = " of %d done" % total
        pct = 100.0 * done / max(1, total)
        self.dom_nodes["bar"].style.transform = "scaleX(%.4f)" % (pct / 100.0)
        box = self.dom_nodes["bar_box"]
        box.setAttribute("role", "progressbar")
        box.setAttribute("aria-label", "Playbook progress")
        box.setAttribute("aria-valuenow", str(int(round(pct))))
        box.setAttribute("aria-valuemin", "0")
        box.setAttribute("aria-valuemax", "100")

    def _next_up(self):
        d = self.progress()["done"]
        return [p for p in self.book["first"] if p["id"] not in d][:3]

    def _tabs(self, refocus=False):
        key = state.focus_key() if refocus else None
        d = self.progress()["done"]
        self.tabs_panel.items = [{"id": s["id"], "n": s["n"], "title": s["title"], "on": s["id"] == self.stage,
                                  "done": len([p for p in s["prompts"] if p["id"] in d]), "total": len(s["prompts"])}
                                 for s in self.book["stages"]]
        if key:
            state.refocus(self.tabs_panel, key)

    def _sheet(self):
        s = self._stage()
        stages = self.book["stages"]
        i = stages.index(s)
        self.stage_big.text = str(s["n"])
        self.stage_title.text = s["title"]
        self.stage_meta.text = "Stage %d of 8 · %s" % (s["n"], state.plural(len(s["prompts"]), "prompt"))
        icon = self.dom_nodes["stage_icon"]
        icon.className = "ic ic-" + s["icon"]
        self.dom_nodes["agency_k"].textContent = "What an agency does here · " + s["role"]
        self.dom_nodes["agency"].textContent = s["agency"]
        self.numbers_note.visible = s["id"] == "measure"
        self.cards_panel.items = [{"p": p, "host": self} for p in s["prompts"]]
        self._prev = stages[i - 1] if i > 0 else None
        self._next = stages[i + 1] if i + 1 < len(stages) else None
        self.prev_button.visible = self._prev is not None
        self.next_button.visible = self._next is not None
        if self._prev:
            self.prev_button.text = self._prev["title"]
        if self._next:
            self.next_button.text = "Next: " + self._next["title"]
        last = i == len(stages) - 1
        self.hidden_panel.items = [{"text": h, "role": ["pl-hidden-note"]} for h in self.book["hidden"]] if last else []

    def show_stage(self, stage_id, top=False):
        self.stage = stage_id
        mg.store_set("stage." + (self.plan.get("id") or self.kind), stage_id)
        self._tabs(refocus=not top)
        self._sheet()
        if top:
            body = self.dom_nodes["body"]
            anvil.js.window.scrollTo({"top": body.getBoundingClientRect().top + anvil.js.window.scrollY - 70, "behavior": "smooth"})

    # ---- events
    def _tab(self, stage, **event_args):
        self.show_stage(stage)

    def _jump(self, pid, **event_args):
        for p in self.book["prompts"]:
            if p["id"] == pid and p["stage"] != self.stage:
                self.show_stage(p["stage"])
        for c in self.cards_panel.get_components():
            if getattr(c, "pid", None) == pid:
                getattr(c, "scroll_to")()

    @handle("prev_button", "click")
    def prev_button_click(self, **event_args):
        if self._prev:
            self.show_stage(self._prev["id"], top=True)

    @handle("next_button", "click")
    def next_button_click(self, **event_args):
        if self._next:
            self.show_stage(self._next["id"], top=True)

    @handle("download_button", "click")
    def download_button_click(self, **event_args):
        mg.download(self.plan["profile"], self.progress())
        state.toast("Downloaded your playbook as a Markdown file.", "ok")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("Its progress and notes go too. This can't be undone.", title="Delete this plan?",
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_plan", self.plan["id"]) is not None:
                state.toast("Plan deleted.")
                router.go("home")
