from anvil import *

from ._anvil_designer import FunnelStepTemplate


class FunnelStep(FunnelStepTemplate):
    """Ad math funnel: clicks, leads, customers. item = {label, value, text, width (0-100), tone (1-3)}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.dom_nodes["label"].textContent = i["label"]
        self.dom_nodes["val"].textContent = i["text"]
        bar = self.dom_nodes["bar"]
        bar.classList.add("t%d" % i["tone"])
        bar.style.transform = "scaleX(%.4f)" % (max(1.0, i["width"]) / 100.0)
