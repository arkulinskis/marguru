from anvil import *
import anvil.server

from ._anvil_designer import HomeTemplate
from ... import mg, state


class Home(HomeTemplate):
    """#home ("Desk"): the signed-in start page. Your plans with progress and the next prompt, a Guru tip, the latest
    wins. A plan made before signing in (mg store 'guestPlan') is moved into the account here, once, with its monthly
    numbers (mg store 'scores.local')."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.hello, 1)
        me = state.me() or {}
        self.hello.text = "Hello, " + ((me.get("name") or "there").split(" ")[0])
        self._import_guest()
        d = anvil.server.call("get_desk")
        plans = d["plans"]
        self.plans_part.visible = bool(plans)
        self.empty_part.visible = not plans
        self.new_link.visible = bool(plans)
        self.plans_panel.items = plans
        tip = mg.tip_of_day()
        self.tip_text.text = tip[0]
        self.tip_source.text = "Source: " + tip[1]
        self.wins_panel.items = d["wins"]
        self.no_wins.visible = not d["wins"]

    def _import_guest(self):
        g = mg.store_get("guestPlan") or {}
        if not g.get("profile"):
            return
        r = state.call("save_plan", g["profile"], None, g.get("progress"))
        if r:
            mg.store_set("guestPlan", None)
            self._import_scores(r["plan"]["id"])
            state.toast('Saved "%s" to your account.' % r["plan"]["name"], "ok")

    def _import_scores(self, plan_id):
        """Monthly numbers kept in this browser (#numbers/local) follow the guest plan into the account."""
        scores = mg.store_get("scores.local") or {}
        if not isinstance(scores, dict) or not scores:
            return
        for month in sorted(scores.keys())[-36:]:
            s = scores[month] or {}
            state.call_quiet("save_score", plan_id, month, s.get("numbers") or {}, s.get("note") or "")
        mg.store_set("scores.local", None)
