from anvil import *

from ._anvil_designer import KpiTemplate


class Kpi(KpiTemplate):
    """Ad math: one result number. item = [value text, label]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["val"].textContent = self.item[0]
        self.dom_nodes["label"].textContent = self.item[1]
