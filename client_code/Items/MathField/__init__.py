from anvil import *

from ._anvil_designer import MathFieldTemplate


class MathField(MathFieldTemplate):
    """Ad math: one number (a slider and a box that follow each other).
    item = {key, label, unit, min, max, step, value, hint}. A change raises x-value on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        n = self.dom_nodes
        n["label"].textContent = i["label"]
        n["hint"].textContent = i.get("hint") or ""
        r, b = n["range"], n["num"]
        for k in ("min", "max", "step"):
            r.setAttribute(k, str(i[k]))
        b.setAttribute("step", str(i["step"]))
        r.setAttribute("aria-label", i["label"])
        b.setAttribute("aria-label", "%s (%s)" % (i["label"], i["unit"]))
        self.set_value(i["value"])

    def set_value(self, v):
        self.dom_nodes["range"].value = str(v)
        self.dom_nodes["num"].value = str(v)

    def _changed(self, source, other):
        try:
            v = float(str(source.value))
        except ValueError:
            return
        if v < 0:
            return
        other.value = str(source.value)
        self.parent.raise_event("x-value", key=self.item["key"], value=v)

    def range_input(self, event):
        self._changed(self.dom_nodes["range"], self.dom_nodes["num"])

    def num_input(self, event):
        self._changed(self.dom_nodes["num"], self.dom_nodes["range"])
