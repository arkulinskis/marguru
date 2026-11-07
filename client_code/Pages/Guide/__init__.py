from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import GuideTemplate
from ... import guide_data as G
from ... import mg, router, state


class Guide(GuideTemplate):
    """#guide, #guide/<section>: "What agencies actually do", the research behind Marguru in plain words: the 8 jobs
    (mg.js STAGES + guide_data.INVOICE), why everyone opens one, what it costs (Ahrefs survey), red flags with the
    agency checker, DIY vs hire, the jargon buster and every source. Sections: short, jobs, boom, cost, flags, diy,
    words, sources. Only checked facts (guide_data.py)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.section = args[0] if args else None
        self.answers: dict = {}
        self.jobs_panel.items = [{"n": s["n"], "title": s["title"], "icon": s["icon"], "role": s["role"],
                                  "agency": s["agency"], "invoice": G.INVOICE[s["id"]]} for s in mg.DATA["STAGES"]]
        self.flags_panel.items = [{"i": i, "text": f[0], "bad": f[1]} for i, f in enumerate(G.FLAGS)]
        self.flags_panel.add_event_handler("x-answer", self._answer)
        self.score_box.visible = False
        state.live(self.score_text)
        self.words_panel.items = G.WORDS
        self.no_words.visible = False
        state.set_control_attr(self.words_box, "type", "search")
        state.set_control_attr(self.words_box, "aria-label", "Search the jargon")
        self.words_box.add_event_handler("change", self._search)
        self.sources_panel.items = G.SOURCES

    def shown(self):
        """Called by the router after the page is on screen: scroll to #guide/<section>."""
        if self.section:
            window.setTimeout(lambda: self._scroll(self.section, False), 60)

    def _scroll(self, sec, smooth=True):
        el = self.dom_nodes["wrap"].querySelector("#gd-" + str(sec))
        if el:
            el.scrollIntoView({"behavior": "smooth"} if smooth else {})

    def wrap_click(self, event):
        """Section links scroll inside the page (the address changes too, so it can be shared)."""
        a = event.target.closest("[data-sec]") if event.target and getattr(event.target, "closest", None) else None
        if not a:
            return
        event.preventDefault()
        sec = a.getAttribute("data-sec")
        router.replace("guide", sec)
        self._scroll(sec)

    # ---- agency checker
    def _answer(self, i, answer, **event_args):
        self.answers[i] = answer
        n = len(self.answers)
        bad = len([k for k, a in self.answers.items() if a == G.FLAGS[k][1]])
        if bad == 0:
            title, text = "So far, so good.", "No red flags in what you've answered. Still get everything in writing."
        elif bad <= 2:
            title = "Ask more questions."
            text = state.plural(bad, "warning sign") + ". Raise each one with them before signing; good agencies have good answers."
        else:
            title = "Walk away, or get it fixed in writing."
            text = state.plural(bad, "warning sign") + ". That's a lot. Use the \"Grill them\" prompt in your playbook (Measure stage) to check the proposal."
        self.score_box.visible = True
        self.score_title.text = title
        self.score_text.text = "%s (%d of %d answered)" % (text, n, len(G.FLAGS))

    # ---- jargon search
    def _search(self, **event_args):
        q = (self.words_box.text or "").strip().lower()
        words = [w for w in G.WORDS if not q or q in (w[0] + " " + w[1]).lower()]
        self.words_panel.items = words
        self.no_words.visible = not words
