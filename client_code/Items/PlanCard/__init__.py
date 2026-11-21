from anvil import *

from ._anvil_designer import PlanCardTemplate
from ... import mg, router, state


class PlanCard(PlanCardTemplate):
    """Desk: one saved plan with its progress ring and this week's tasks (mg.weeks, 2026-11-20), plus links to the
    playbook's week view and to #numbers. item = a plan from get_desk. The plan's name is the card's link (stretched
    over the card in CSS); the two buttons sit above it."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        profile = p.get("profile") or {}
        progress = p.get("progress") or {}
        b = mg.build(profile)
        d = progress.get("done") or {}
        done = len([x for x in b["prompts"] if x["id"] in d])
        total = len(b["prompts"])
        pct = int(round(100.0 * done / max(1, total)))
        n = self.dom_nodes
        n["link"].setAttribute("href", router.href("plan", p["id"]))
        n["week_link"].setAttribute("href", router.href("plan", p["id"]))
        n["week_link"].addEventListener("click", self._week_view)
        n["num_link"].setAttribute("href", router.href("numbers", p["id"]))
        n["name"].textContent = p["name"]
        n["meta"].textContent = "%s · updated %s" % (mg.label("TYPES", profile.get("type")), state.ago(p.get("updated")))
        n["ring"].style.setProperty("--p", str(pct))
        n["ring"].setAttribute("role", "img")
        n["ring"].setAttribute("aria-label", "%d%% done" % pct)
        n["pct"].textContent = "%d%%" % pct
        n["count"].textContent = "%d of %d prompts done" % (done, total)
        wk = mg.weeks(profile, progress, p.get("created") or "")
        this = wk["weeks"][wk["current"]]
        todo = [t for t in this["items"] if not t["done"]]
        self.week_panel.items = [{"text": "%s (%s)" % (t["title"], t["time"]), "role": ["dk-week-t"]} for t in todo[:3]]
        if todo:
            n["next"].style.display = "none"
            if len(todo) > 3:
                n["next"].style.display = ""
                n["next"].textContent = "+ %d more" % (len(todo) - 3)
        elif done >= total:
            n["next_k"].style.display = "none"
            n["next"].textContent = "All done. Time to share a win?"
        else:
            n["next"].textContent = "This week's tasks are done. Nice."

    def _week_view(self, event):
        """"Your week" opens the playbook in its By week view."""
        mg.store_set("view." + self.item["id"], "week")
