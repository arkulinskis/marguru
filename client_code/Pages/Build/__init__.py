from anvil import *

from ._anvil_designer import BuildTemplate
from ... import mg, router, state

# choice groups: profile key -> (mg.DATA list, show the small sub-line)
GROUPS = {"type": ("TYPES", True), "reach": ("REACH", True), "repeat": ("REPEAT", False), "goal": ("GOALS", False),
          "budget": ("BUDGETS", False), "voice": ("VOICES", False)}
HAS = ["site", "gbp", "social", "email", "reviews", "photos"]


def _number(v):
    """18, "18", 18.0 -> 18; empty, 0 or nonsense -> None."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return int(n) if n == int(n) else n


LEAD = "The more specific you are, the better every prompt gets. Anything you skip becomes a [bracket] to fill in later."


class Build(BuildTemplate):
    """#build, #build/<plan id>, #build/local: describe the business (anyone can use it).
    Signed in: save_plan -> #plan/<id>. Guest: the plan is kept in this browser (mg store 'guestPlan') -> #plan/local,
    and the Desk moves it into the account after sign-up. The live counter shows how many prompts the answers unlock."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        arg = args[0] if args else ""
        self.plan_id = arg if arg and arg != "local" else None
        self.boxes = {"name": (self.name_box, 80), "site_url": (self.site_box, 200), "what": (self.what_box, 200),
                      "where": (self.where_box, 120), "customer": (self.customer_box, 300), "price": (self.price_box, 9),
                      "edge": (self.edge_box, 300), "competitors": (self.competitors_box, 200), "tried": (self.tried_box, 400)}
        self.panels = {"type": self.type_panel, "reach": self.reach_panel, "repeat": self.repeat_panel,
                       "goal": self.goal_panel, "budget": self.budget_panel, "voice": self.voice_panel}
        self.checks = {"site": self.has_site, "gbp": self.has_gbp, "social": self.has_social, "email": self.has_email,
                       "reviews": self.has_reviews, "photos": self.has_photos}
        for key, (box, n) in self.boxes.items():
            state.set_control_attr(box, "maxlength", n)
            box.add_event_handler("change", self._changed)
        for box in (self.customer_box, self.edge_box, self.tried_box):
            box.height = "84"
        state.set_control_attr(self.price_box, "min", 0)
        state.set_control_attr(self.price_box, "step", 1)
        state.set_control_attr(self.price_box, "inputmode", "numeric")
        for panel in self.panels.values():
            panel.add_event_handler("x-pick", self._pick)
        for box in self.checks.values():
            box.add_event_handler("change", self._changed)
        self.guest_hint.visible = not state.me()
        self.tip.text = "Guru tip: " + mg.tip_of_day()[0]

        profile, editing = None, False
        if self.plan_id and state.me():
            r = state.call("get_plan", self.plan_id)
            if r:
                profile, editing = r["plan"]["profile"], True
            else:
                self.plan_id = None
        elif arg == "local":
            g = mg.store_get("guestPlan") or {}
            if g.get("profile"):
                profile, editing = g["profile"], True
        self.editing = editing
        self.lead.text = ("Edit your plan. " if editing else "New plan, about 3 minutes. ") + LEAD
        label = "Save changes" if editing else "Build my playbook"
        self.save_button.text = label
        self.save_mob.text = label
        self.save_mob.role = ["btn", "btn-primary", "ic-arrow"]
        p = mg.blank()
        p.update(profile or {})
        self.fill(p)

    # ---- the form <-> a profile dict
    def fill(self, p):
        for key, (box, _) in self.boxes.items():
            v = p.get(key)
            if key == "price":
                box.text = _number(v)  # a number TextBox takes a number (or None)
            else:
                box.text = "" if v is None else str(v)
        self.vals = {k: str(p.get(k) or "") for k in GROUPS}
        for key, (list_name, sub) in GROUPS.items():
            self.panels[key].items = [{"group": key, "value": o[0], "label": o[1], "sub": o[2] if sub and len(o) > 2 else "",
                                       "checked": self.vals[key] == o[0]} for o in mg.DATA[list_name]]
        has = p.get("has") or {}
        for key, box in self.checks.items():
            box.checked = bool(has.get(key))
        self.update()

    def read(self):
        p = {}
        for key, (box, _) in self.boxes.items():
            v = box.text
            if key == "price":
                n = _number(v)
                p[key] = "" if n is None else str(n)
            else:
                p[key] = "" if v is None else str(v)
        p.update(self.vals)
        p["has"] = {k: True for k, box in self.checks.items() if box.checked}
        return p

    def update(self):
        c = mg.stage_counts(self.read())
        self.count_big.text = str(c["prompts"])
        self.count_mob.text = str(c["prompts"])
        self.stages_line.text = "prompts across %d stages" % len(c["stages"])
        self.stage_panel.items = [{"text": "%s %d" % (s["title"], s["n"]), "role": ["badge"]} for s in c["stages"]]

    def _changed(self, **event_args):
        self.update()

    def _pick(self, group, value, **event_args):
        self.vals[group] = value
        self.update()

    # ---- actions
    @handle("example_button", "click")
    def example_button_click(self, **event_args):
        self.fill(mg.example())
        state.toast("Filled in with an example bakery. Change anything you like.")

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        self._save()

    @handle("save_mob", "click")
    def save_mob_click(self, **event_args):
        self._save()

    def _save(self):
        p = self.read()
        if len(p["name"].strip()) < 2:
            state.toast("What's your business called?", "error")
            state.focus(self.name_box)
            return
        if len(p["what"].strip()) < 3:
            state.toast("Say what you sell, in a few words.", "error")
            state.focus(self.what_box)
            return
        if not p.get("type"):
            p["type"] = "other"
        if state.me():
            r = state.call("save_plan", p, self.plan_id)
            if r:
                state.toast("Saved." if self.plan_id else "Your playbook is ready.", "ok")
                router.go("plan", r["plan"]["id"])
        else:
            old = mg.store_get("guestPlan") or {}
            mg.store_set("guestPlan", {"profile": p, "progress": old.get("progress") or {"done": {}, "star": [], "notes": {}},
                                       "updated": mg.now_iso()})
            router.go("plan", "local")
