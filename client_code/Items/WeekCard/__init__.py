from anvil import *

from ._anvil_designer import WeekCardTemplate
from ... import mg


def _hm(mins):
    """95 -> "1 h 35 min"."""
    h, m = divmod(int(mins), 60)
    return ("%d h" % h if h else "") + (" " if h and m else "") + ("%d min" % m if m or not h else "")


class WeekCard(WeekCardTemplate):
    """#plan "By week": one of the 12 weeks (mg.weeks). item = {w: {n, range, items, mins, cap, now, past}, host: the
    Plan page}. Its tasks (Items/WeekTask) open their prompt card through host.jump_to."""

    def __init__(self, **properties):
        super().__init__(**properties)
        w, host = self.item["w"], self.item["host"]
        n = self.dom_nodes
        n["title"].textContent = "Week %d" % w["n"]
        n["range"].textContent = w["range"]
        n["now"].style.display = "" if w["now"] else "none"
        n["card"].classList.toggle("is-now", bool(w["now"]))
        n["card"].classList.toggle("is-past", bool(w["past"]))
        if w["now"]:
            n["card"].setAttribute("aria-current", "date")
        pct = min(100.0, 100.0 * w["mins"] / max(1, w["cap"]))
        n["bar"].style.transform = "scaleX(%.3f)" % (pct / 100.0)
        n["load"].textContent = "%s of %s" % (_hm(w["mins"]), _hm(w["cap"])) if w["items"] else ""
        self.tasks_panel.items = [{"t": t, "host": host, "stage": mg.stage_title(t["stage"]), "past": w["past"]} for t in w["items"]]
        if w["items"]:
            n["empty"].style.display = "none"
        elif w["past"]:
            n["empty"].textContent = "Nothing ticked off this week."
        else:
            n["empty"].textContent = "A free week: redo a prompt with fresh numbers, or take a breather."
