from anvil import *

from ._anvil_designer import WordTemplate


class Word(WordTemplate):
    """Field guide, jargon buster: one term. item = [term, meaning]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["term"].textContent = self.item[0]
        self.dom_nodes["text"].textContent = self.item[1]
