from anvil import *

from ._anvil_designer import GuideJobTemplate


class GuideJob(GuideJobTemplate):
    """Field guide, "The 8 jobs": one stage. item = {n, title, icon, role, agency, invoice}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.dom_nodes["icon"].classList.add("ic-" + i["icon"])
        self.dom_nodes["title"].textContent = i["title"]
        self.dom_nodes["role"].textContent = "%s · %s" % (i["n"], i["role"])
        self.dom_nodes["agency"].textContent = i["agency"]
        self.dom_nodes["inv"].textContent = i["invoice"]
