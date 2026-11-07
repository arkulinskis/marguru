from anvil import *
import anvil.server

from ._anvil_designer import HomeTemplate
from ... import mg, state


class Home(HomeTemplate):
    """#home ("Desk"): the signed-in start page. Your plans with progress and the next prompt, a Guru tip, the latest
    wins. A plan made before signing in (mg store 'guestPlan') is moved into the account here, once."""

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
            state.toast('Saved "%s" to your account.' % r["plan"]["name"], "ok")
