from anvil import *

from ._anvil_designer import FlagQTemplate


class FlagQ(FlagQTemplate):
    """Field guide agency checker: one question. item = {i, text, bad ("yes" or "no": the answer that's a warning sign)}.
    An answer raises x-answer on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.dom_nodes["q"].textContent = i["text"]
        self.dom_nodes["seg"].setAttribute("aria-label", i["text"])
        self.dom_nodes["yes"].classList.add("yes-bad" if i["bad"] == "yes" else "yes-good")
        self.dom_nodes["no"].classList.add("no-bad" if i["bad"] == "no" else "no-good")

    def _answer(self, a):
        self.dom_nodes["yes"].classList.toggle("on", a == "yes")
        self.dom_nodes["no"].classList.toggle("on", a == "no")
        self.parent.raise_event("x-answer", i=self.item["i"], answer=a)

    def yes_click(self, event):
        self._answer("yes")

    def no_click(self, event):
        self._answer("no")
