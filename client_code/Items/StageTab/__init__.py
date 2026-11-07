from anvil import *

from ._anvil_designer import StageTabTemplate


class StageTab(StageTabTemplate):
    """#plan: one binder tab (a stage). item = {id, n, title, done, total, on}; a click raises x-stage."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        btn = self.dom_nodes["btn"]
        complete = i["done"] == i["total"]
        btn.classList.toggle("on", bool(i.get("on")))
        btn.classList.toggle("complete", complete)
        btn.setAttribute("aria-pressed", "true" if i.get("on") else "false")
        btn.setAttribute("data-key", i["id"])
        self.dom_nodes["n"].textContent = str(i["n"])
        self.dom_nodes["title"].textContent = i["title"]
        self.dom_nodes["count"].textContent = "" if complete else "%d/%d" % (i["done"], i["total"])
        self.dom_nodes["tick"].style.display = "inline-block" if complete else "none"
        if complete:
            self.dom_nodes["tick"].setAttribute("aria-label", "all done")
            self.dom_nodes["tick"].setAttribute("role", "img")

    def btn_click(self, event):
        self.parent.raise_event("x-stage", stage=self.item["id"])
