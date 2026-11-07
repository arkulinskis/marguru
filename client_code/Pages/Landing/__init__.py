from anvil import *

from ._anvil_designer import LandingTemplate
from ... import mg, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "bTpH6t4KN2o"


class Landing(LandingTemplate):
    """#landing (also "About" for members): the promise, the live-demo hero (CSS-only loop: describe the business, the
    playbook fills in, a prompt gets copied), the Watch section, the 8 jobs agencies do (from mg.js STAGES), how it
    works, features, the honest rules, FAQ. Static copy lives in the template; only the signed-in variations are set here."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = not me
        self.member_cta.visible = bool(me)
        self.band_guest.visible = not me
        self.band_member.visible = bool(me)
        self.jobs_panel.items = [{"n": s["n"], "title": s["title"], "role": s["role"]} for s in mg.DATA["STAGES"]]
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="Marguru video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
