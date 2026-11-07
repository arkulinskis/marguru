from anvil import *

from ._anvil_designer import TextTemplate


class Text(TextTemplate):
    """One short text in a list. item = {text, role (list of Label roles, optional)}: stage badges on #build,
    tips under the Ad math verdict, the "hidden prompts" notes at the end of a playbook."""

    def __init__(self, **properties):
        super().__init__(**properties)
        if self.item.get("role"):
            self.text.role = self.item["role"]
