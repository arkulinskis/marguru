from anvil import *

from ._anvil_designer import AdminWinTemplate
from ... import mg, state


class AdminWin(AdminWinTemplate):
    """Admin -> Wins: one win with Hide / Show again and Delete. Changes raise x-changed so the page reloads."""

    def __init__(self, **properties):
        super().__init__(**properties)
        w = self.item
        n = self.dom_nodes
        n["channel"].textContent = mg.label("CHANNELS", w["channel"])
        n["demo"].style.display = "" if w.get("demo") else "none"
        n["hid"].style.display = "" if w.get("hidden") else "none"
        n["author"].textContent = w["author"]
        n["when"].textContent = state.short_date(w.get("created"))
        n["claps"].textContent = "%d claps" % w["claps"]
        n["title"].textContent = w["title"]
        n["story"].textContent = w["story"] + ("\n= " + w["result"] if w.get("result") else "")
        self.hide_button.text = "Show again" if w.get("hidden") else "Hide"
        self.hide_button.role = ["btn", "btn-sm", "ic-check" if w.get("hidden") else "ic-x"]

    @handle("hide_button", "click")
    def hide_button_click(self, **event_args):
        if state.call("set_win_hidden", self.item["id"], not self.item.get("hidden")) is not None:
            state.toast("Saved", "ok")
            self.parent.raise_event("x-changed")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("This can't be undone.", title="Delete this win?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_win", self.item["id"]) is not None:
                self.parent.raise_event("x-changed")
