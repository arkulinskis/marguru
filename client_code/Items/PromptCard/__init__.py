from anvil import *

from ._anvil_designer import PromptCardTemplate
from ... import mg, state

LEVELS = ["", "Easy", "Some effort", "Involved"]


class PromptCard(PromptCardTemplate):
    """#plan: one prompt card. item = {p: the built prompt (mg.build), host: the Plan page}.
    The page keeps the progress (host.progress(), host.persist(...)); the card redraws itself (draw) so the keyboard
    keeps its place. Copy / ChatGPT / Claude also count an anonymous copy (track_copy)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item["p"]
        self.host = self.item["host"]
        self.pid = p["id"]
        self.open = False
        n = self.dom_nodes
        n["card"].id = "p-" + p["id"]
        n["num"].textContent = ("0" if p["n"] < 10 else "") + str(p["n"])
        n["title"].textContent = p["title"]
        n["time"].textContent = p["time"]
        lv = int(p.get("level") or 1)
        n["lv"].setAttribute("title", LEVELS[lv] if lv < len(LEVELS) else "")
        n["lv"].setAttribute("aria-label", LEVELS[lv] if lv < len(LEVELS) else "")
        n["lv_on"].textContent = "●" * lv
        n["lv_off"].textContent = "●" * (3 - lv)
        n["why"].textContent = p["why"]
        n["get"].textContent = p["get"]
        n["next"].textContent = p["next"]
        n["gpt"].setAttribute("href", mg.open_url("chatgpt", p["text"]))
        n["claude"].setAttribute("href", mg.open_url("claude", p["text"]))
        state.set_control_attr(self.note_area, "maxlength", 2000)
        state.set_control_attr(self.note_area, "aria-label", "Your notes on this prompt")
        self.note_area.text = self.host.progress()["notes"].get(self.pid, "")
        self.note_open = False
        self.draw()

    def draw(self, stamping=False):
        pr = self.host.progress()
        done = self.pid in pr["done"]
        star = self.pid in pr["star"]
        note = pr["notes"].get(self.pid, "")
        n = self.dom_nodes
        n["card"].classList.toggle("is-done", done)
        n["card"].classList.toggle("stamping", bool(stamping))
        n["stamp"].style.display = "" if done else "none"
        n["star"].classList.toggle("on", star)
        n["star"].setAttribute("aria-pressed", "true" if star else "false")
        n["done"].checked = done
        n["note_btn"].classList.toggle("pc-hasnote", bool(note))
        n["note_t"].textContent = "Notes" if note else "Note"
        n["note_btn"].setAttribute("aria-expanded", "true" if self.note_open else "false")
        n["note_box"].style.display = "" if self.note_open else "none"
        self._prompt()

    def _prompt(self):
        """Collapsed, the shared business brief shrinks to a chip so each card shows its own task first."""
        text, brief = self.item["p"]["text"], self.host.book["v"]["brief"]
        n = self.dom_nodes
        i = text.find(brief)
        n["box"].classList.toggle("closed", not self.open)
        n["more"].textContent = "Show less" if self.open else "Show the full prompt"
        n["more"].setAttribute("aria-expanded", "true" if self.open else "false")
        if self.open or i < 0:
            n["pre_a"].textContent, n["pre_b"].textContent = text, ""
            n["chip"].style.display = "none"
        else:
            n["pre_a"].textContent = text[:i]
            n["pre_b"].textContent = text[i + len(brief):]
            n["chip_t"].textContent = "your business brief, %d lines" % len(brief.split("\n"))
            n["chip"].style.display = ""

    def more_click(self, event):
        self.open = not self.open
        self._prompt()

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        ok = mg.copy(self.item["p"]["text"])
        state.toast("Copied. Paste it into ChatGPT, Claude or any AI chat." if ok
                    else "Couldn't copy: select the prompt text and copy it by hand.", "ok" if ok else "error")
        self.host.track(self.pid)

    def _open(self, where):
        """The link opens the chat; copying too means a paste always works."""
        mg.copy_soon(self.item["p"]["text"])
        state.toast("Opening %s. The prompt is also copied, in case it doesn't appear." % where)
        self.host.track(self.pid)

    def gpt_click(self, event):
        self._open("ChatGPT")

    def claude_click(self, event):
        self._open("Claude")

    def star_click(self, event):
        on = self.pid not in self.host.progress()["star"]
        self.host.persist(self.pid, "star", on)
        self.draw()

    def note_click(self, event):
        self.note_open = not self.note_open
        self.draw()
        if self.note_open:
            state.focus(self.note_area)

    @handle("note_area", "lost_focus")
    def note_area_lost_focus(self, **event_args):
        val = (self.note_area.text or "").strip()
        if val == self.host.progress()["notes"].get(self.pid, ""):
            return
        self.host.persist(self.pid, "note", val)
        if self.host.kind != "example":
            state.toast("Note saved.")
        self.draw()

    def done_change(self, event):
        on = bool(self.dom_nodes["done"].checked)
        self.host.persist(self.pid, "done", on)
        self.draw(stamping=on)
        self.host.step_done(self, on)

    def stamp_node(self):
        return self.dom_nodes["stamp"]

    def scroll_to(self):
        card = self.dom_nodes["card"]
        card.scrollIntoView({"behavior": "smooth", "block": "start"})
        card.classList.remove("flash")
        card.offsetWidth  # restart the animation
        card.classList.add("flash")
