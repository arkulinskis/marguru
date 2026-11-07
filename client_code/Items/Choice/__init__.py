from anvil import *

from ._anvil_designer import ChoiceTemplate


class Choice(ChoiceTemplate):
    """#build: one radio card. item = {group, value, label, sub, checked}. Picking it raises x-pick on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        box = self.dom_nodes["input"]
        box.name = "mg-" + i["group"]
        box.value = i["value"]
        box.checked = bool(i.get("checked"))
        self.dom_nodes["label"].textContent = i["label"]
        sub = self.dom_nodes["sub"]
        sub.textContent = i.get("sub") or ""
        sub.style.display = "block" if i.get("sub") else "none"

    def input_change(self, event):
        if self.dom_nodes["input"].checked and self.parent is not None:
            self.parent.raise_event("x-pick", group=self.item["group"], value=self.item["value"])
