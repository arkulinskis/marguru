from anvil import *

from ._anvil_designer import PromptStatTemplate
from ... import mg, state


class PromptStat(PromptStatTemplate):
    """Admin -> Prompts: how often one prompt was copied. item = {id, copies, last, max}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        m = mg.info(i["id"])
        self.dom_nodes["title"].textContent = m["title"] if m else i["id"]
        self.dom_nodes["stage"].textContent = mg.stage_title(m["stage"]) if m else ""
        self.dom_nodes["copies"].textContent = str(i["copies"])
        self.dom_nodes["last"].textContent = state.ago(i.get("last"))
        self.dom_nodes["bar"].style.transform = "scaleX(%.4f)" % (max(3.0, 100.0 * i["copies"] / max(1, i["max"])) / 100.0)
