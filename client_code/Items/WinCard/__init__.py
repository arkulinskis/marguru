from anvil import *

from ._anvil_designer import WinCardTemplate
from ... import mg, router, state


class WinCard(WinCardTemplate):
    """Wins board: one win. Anyone reads; members clap ("This helped", a toggle) and delete their own.
    item = a win (Wins.win_dict). Deleting raises x-deleted on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_control_attr(self.delete_button, "aria-label", "Delete")
        self.draw()

    def draw(self):
        w = self.item
        n = self.dom_nodes
        n["card"].classList.toggle("is-hidden", bool(w.get("hidden")))
        n["card"].setAttribute("data-id", w["id"])
        n["channel"].textContent = mg.label("CHANNELS", w["channel"])
        n["btype"].textContent = mg.label("TYPES", w.get("business_type"))
        n["demo"].style.display = "" if w.get("demo") else "none"
        n["hid"].style.display = "" if w.get("hidden") else "none"
        n["title"].textContent = w["title"]
        n["story"].textContent = w["story"]
        n["res"].style.display = "" if w.get("result") else "none"
        n["result"].textContent = w.get("result") or ""
        n["by"].textContent = "%s · %s" % (w["author"], state.ago(w.get("created")))
        self.clap_button.text = "This helped · %d" % w["claps"]
        self.clap_button.role = ["btn", "btn-sm", "wn-clap", "ic-clap"] + (["on"] if w.get("clapped") else [])
        state.set_control_attr(self.clap_button, "aria-pressed", "true" if w.get("clapped") else "false")
        self.delete_button.visible = bool(w.get("can_delete"))

    @handle("clap_button", "click")
    def clap_button_click(self, **event_args):
        if not state.me():
            state.toast("Sign in to clap for a win.")
            router.remember_after("#wins")
            router.go("auth")
            return
        r = state.call("clap_win", self.item["id"])
        if r:
            self.item = r["win"]
            self.draw()

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("This can't be undone.", title="Delete this win?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_win", self.item["id"]) is not None:
                state.toast("Deleted.")
                self.parent.raise_event("x-deleted", win_id=self.item["id"])
