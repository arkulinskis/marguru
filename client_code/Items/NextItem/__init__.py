from anvil import *

from ._anvil_designer import NextItemTemplate


class NextItem(NextItemTemplate):
    """#plan "Start here": one of the next three prompts. item = {id, k, title, stage}; a click raises x-jump."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["k"].textContent = self.item["k"]
        self.dom_nodes["title"].textContent = self.item["title"]
        self.dom_nodes["stage"].textContent = self.item["stage"]

    def btn_click(self, event):
        self.parent.raise_event("x-jump", pid=self.item["id"])
