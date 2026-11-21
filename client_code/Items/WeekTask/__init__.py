from anvil import *

from ._anvil_designer import WeekTaskTemplate

REPEATS = {"week": "every week", "month": "every 4 weeks"}


class WeekTask(WeekTaskTemplate):
    """#plan "By week": one task in a week. item = {t: {id, title, stage, time, mins, repeat, done}, stage (title),
    host: the Plan page, past}. A click opens the prompt's card (host.jump_to)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item["t"]
        n = self.dom_nodes
        n["title"].textContent = t["title"]
        bits = [self.item.get("stage") or "", t["time"]]
        if t.get("repeat"):
            bits.append(REPEATS.get(t["repeat"], ""))
        if t.get("done"):
            bits.append("done")
        n["meta"].textContent = " · ".join([b for b in bits if b])
        n["btn"].classList.toggle("is-done", bool(t.get("done")))
        n["tick"].textContent = "✓" if t.get("done") else ""
        n["btn"].setAttribute("aria-label", "%s (%s). Open the prompt" % (t["title"], n["meta"].textContent))

    def btn_click(self, event):
        self.item["host"].jump_to(self.item["t"]["id"])
