from anvil import *
import anvil.server

from ._anvil_designer import WinsTemplate
from ...Dialogs.PostWin import PostWin
from ... import mg, router, state


class Wins(WinsTemplate):
    """#wins, #wins/<channel>: owners share a marketing move that worked. Anyone reads; members post (Dialogs/PostWin),
    clap ("This helped") and delete their own (Items/WinCard); admins also see hidden ones (hide them in Admin -> Wins).
    Demo wins are labelled "Example": made up to show the format."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.channel = args[0] if args else ""
        self.new_button.visible = bool(me)
        self.guest_cta.visible = not me
        self.empty_text.text = "Be the first: share what worked for you." if me else "Sign up and be the first to share one."
        self.chips_panel.add_event_handler("x-channel", self._channel)
        self.wins_panel.add_event_handler("x-deleted", self._deleted)
        self.wins = anvil.server.call("list_wins", None)["wins"]
        self._chips()
        self.draw()

    def _chips(self, refocus=False):
        key = state.focus_key() if refocus else None
        chips = [{"id": "", "label": "All", "on": not self.channel}]
        chips += [{"id": c[0], "label": c[1], "on": self.channel == c[0]} for c in mg.DATA["CHANNELS"]]
        self.chips_panel.items = chips
        if key:
            state.refocus(self.chips_panel, key)

    def draw(self):
        shown = [w for w in self.wins if not self.channel or w["channel"] == self.channel]
        self.wins_panel.items = shown
        self.wins_panel.visible = bool(shown)
        self.empty.visible = not shown

    def _channel(self, channel, **event_args):
        self.channel = channel
        router.replace("wins", channel)
        self._chips(refocus=True)
        self.draw()

    def _deleted(self, win_id, **event_args):
        self.wins = [w for w in self.wins if w["id"] != win_id]
        self.draw()

    @handle("new_button", "click")
    def new_button_click(self, **event_args):
        win = alert(PostWin(), buttons=[], large=True, role="app-dialog", dismissible=True)
        if win:
            self.wins.insert(0, win)
            self.draw()
            state.toast("Posted. Thank you for sharing!", "ok")
            for c in self.wins_panel.get_components():
                if getattr(c, "item")["id"] == win["id"]:
                    mg.confetti(c)
