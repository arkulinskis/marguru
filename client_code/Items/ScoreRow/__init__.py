from anvil import *

from ._anvil_designer import ScoreRowTemplate

KEYS = ("calls", "enquiries", "customers", "sales", "reviews", "spend", "cpl", "cpc")


class ScoreRow(ScoreRowTemplate):
    """#numbers, "The last 6 months": one month. item = {month, label, latest, cells: {key: {text, arrow, tone, title}},
    note, host: the Scores page}. Cells without a number are hidden; Edit loads the month into the form above."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        n = self.dom_nodes
        n["month"].textContent = i["label"]
        n["latest"].style.display = "" if i.get("latest") else "none"
        n["edit"].setAttribute("aria-label", "Edit " + i["label"])
        cells = i.get("cells") or {}
        for k in KEYS:
            c = cells.get(k)
            n["c_" + k].style.display = "" if c else "none"
            if not c:
                continue
            n["v_" + k].textContent = c["text"]
            a = n["a_" + k]
            a.textContent = c.get("arrow") or ""
            a.className = "sc-arrow " + (c.get("tone") or "")
            if c.get("title"):
                a.setAttribute("title", c["title"])
                a.setAttribute("aria-label", c["title"])
        n["note"].textContent = i.get("note") or ""
        n["note"].style.display = "" if i.get("note") else "none"

    def edit_click(self, event):
        self.item["host"].pick_month(self.item["month"])
