from anvil import *

from ._anvil_designer import JobTileTemplate


class JobTile(JobTileTemplate):
    """Landing: one of the 8 jobs an agency does. item = {n, title, role} (mg.js STAGES)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["n"].textContent = str(self.item["n"])
        self.dom_nodes["title"].textContent = self.item["title"]
        self.dom_nodes["role"].textContent = self.item["role"]
