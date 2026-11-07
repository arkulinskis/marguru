from anvil import *

from ._anvil_designer import PlanCardTemplate
from ... import mg, router, state


class PlanCard(PlanCardTemplate):
    """Desk: one saved plan with its progress ring and the next prompt. item = a plan from get_desk."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        b = mg.build(p["profile"])
        d = (p.get("progress") or {}).get("done") or {}
        done = len([x for x in b["prompts"] if x["id"] in d])
        total = len(b["prompts"])
        pct = int(round(100.0 * done / max(1, total)))
        nxt = [x for x in b["first"] if x["id"] not in d]
        n = self.dom_nodes
        n["link"].setAttribute("href", router.href("plan", p["id"]))
        n["name"].textContent = p["name"]
        n["meta"].textContent = "%s · updated %s" % (mg.label("TYPES", (p.get("profile") or {}).get("type")), state.ago(p.get("updated")))
        n["ring"].style.setProperty("--p", str(pct))
        n["ring"].setAttribute("role", "img")
        n["ring"].setAttribute("aria-label", "%d%% done" % pct)
        n["pct"].textContent = "%d%%" % pct
        n["count"].textContent = "%d of %d prompts done" % (done, total)
        if nxt:
            n["next"].textContent = nxt[0]["title"]
        else:
            n["next_k"].style.display = "none"
            n["next"].textContent = "All done. Time to share a win?"
