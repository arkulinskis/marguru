from anvil import *

from ._anvil_designer import SourceTemplate


class Source(SourceTemplate):
    """Field guide, sources: one source. item = [kind, title, url, what it says]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        kind, title, url, note = self.item
        k = self.dom_nodes["kind"]
        k.textContent = kind
        k.classList.add("good" if kind == "Primary source" else "warn" if kind == "Practitioner" else "brand")
        self.dom_nodes["link"].textContent = title
        self.dom_nodes["link"].setAttribute("href", url)
        self.dom_nodes["note"].textContent = note
