from anvil import *
import anvil.server

from ._anvil_designer import PostWinTemplate
from ... import mg, state


class PostWin(PostWinTemplate):
    """Wins board: share a win. Closes with the new win (from post_win), or None when cancelled."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.channel_box.items = [(c[1], c[0]) for c in mg.DATA["CHANNELS"]]
        self.type_box.items = [(t[1], t[0]) for t in mg.DATA["TYPES"]]
        self.channel_box.selected_value = mg.DATA["CHANNELS"][0][0]
        self.type_box.selected_value = mg.DATA["TYPES"][0][0]
        for box, n in ((self.title_box, 120), (self.story_box, 1500), (self.result_box, 200)):
            state.set_control_attr(box, "maxlength", n)
        self.story_box.height = "130"

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("post_button", "click")
    def post_button_click(self, **event_args):
        data = {"title": (self.title_box.text or "").strip(), "channel": self.channel_box.selected_value,
                "business_type": self.type_box.selected_value, "story": (self.story_box.text or "").strip(),
                "result": (self.result_box.text or "").strip()}
        if not data["title"] or not data["story"]:
            self.message.text = "Give it a title and say what you did."
            self.message.visible = True
            return
        self.post_button.enabled = False
        try:
            r = anvil.server.call("post_win", data)
        finally:
            self.post_button.enabled = True
        if not isinstance(r, dict) or r.get("ok") is False:
            self.message.text = (r or {}).get("error") or "That didn't work."
            self.message.visible = True
            return
        self.raise_event("x-close-alert", value=r["win"])
