from anvil import *

from ._anvil_designer import ChannelChipTemplate


class ChannelChip(ChannelChipTemplate):
    """Wins board filter: one channel. item = {id, label, on}; a click raises x-channel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        b = self.dom_nodes["btn"]
        b.textContent = self.item["label"]
        b.classList.toggle("on", bool(self.item.get("on")))
        b.setAttribute("aria-pressed", "true" if self.item.get("on") else "false")
        b.setAttribute("data-key", self.item["id"] or "all")

    def btn_click(self, event):
        self.parent.raise_event("x-channel", channel=self.item["id"])
