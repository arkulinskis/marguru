from anvil import *

from ._anvil_designer import WinLineTemplate
from ... import mg


class WinLine(WinLineTemplate):
    """Desk: one of the latest wins. item = a win (Wins.win_dict)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        w = self.item
        self.dom_nodes["title"].textContent = w["title"]
        self.dom_nodes["meta"].textContent = "%s · %s%s" % (w["author"], mg.label("CHANNELS", w["channel"]), " · Example" if w.get("demo") else "")
