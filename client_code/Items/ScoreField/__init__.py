from anvil import *

from ._anvil_designer import ScoreFieldTemplate


class ScoreField(ScoreFieldTemplate):
    """#numbers: one monthly number. item = {key, label, hint, unit ("$" or ""), value (number or None)}.
    The page reads value() from every field when saving or copying the report."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        n = self.dom_nodes
        n["label"].textContent = i["label"]
        n["hint"].textContent = i.get("hint") or ""
        n["unit"].textContent = i.get("unit") or ""
        n["num"].classList.toggle("has-unit", bool(i.get("unit")))
        n["num"].setAttribute("placeholder", "skip if you don't know")
        v = i.get("value")
        n["num"].value = "" if v is None else str(v)

    def value(self):
        """The typed number as text ("" when blank)."""
        return str(self.dom_nodes["num"].value or "").strip()

    def num_input(self, event):
        self.dom_nodes["num"].classList.remove("bad")
