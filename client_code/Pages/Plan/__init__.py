from anvil import *
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
    #plan/<id> to sign-in for visitors, and #plan/local to #build when this browser has no plan."""

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
        if self.kind == "example":
            self.plan = {"id": None, "profile": mg.example(), "progress": _clean(EXAMPLE_PROGRESS)}
        elif self.kind == "local":
            g = mg.store_get("guestPlan") or {}
            self.plan = {"id": None, "profile": g.get("profile") or mg.blank(), "progress": _clean(g.get("progress"))}
        else:
            r = anvil.server.call("get_plan", arg)
            if not isinstance(r, dict) or not r.get("ok"):
                self.book_part.visible = False
                return
            self.plan = r["plan"]
            self.plan["progress"] = _clean(self.plan.get("progress"))
        self.missing.visible = False
        self.stage = mg.store_get("stage." + (self.plan.get("id") or self.kind))
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
        self._progress_bar()
        nxt = self._next_up()
        self.next_part.visible = bool(nxt)
        self.all_done.visible = not nxt
        self.next_panel.items = [{"id": p["id"], "k": ("Next up" if i == 0 else "Then") + " · " + p["time"], "title": p["title"],
                                  "stage": mg.stage_title(p["stage"])} for i, p in enumerate(nxt)]
        self._tabs()
        self._sheet()

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
