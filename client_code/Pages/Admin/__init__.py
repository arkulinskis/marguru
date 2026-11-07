from anvil import *

from ._anvil_designer import AdminTemplate
from ... import state

TABS = ["overview", "feedback", "users", "wins", "prompts", "demo"]


class Admin(AdminTemplate):
    """#admin/<tab>: overview numbers, the old feedback inbox, users (admin / active switches), Marguru's Wins (hide /
    show / delete any win) and Prompts (which prompts people copy most, anonymous counts), and the demo data.
    Each tab is its own address, so the browser's back button works."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "overview"
        self._filter = "new"
        parts = {"overview": self.overview_part, "feedback": self.feedback_part, "users": self.users_part,
                 "wins": self.wins_part, "prompts": self.prompts_part, "demo": self.demo_part}
        tabs = {"overview": self.tab_overview, "feedback": self.tab_feedback, "users": self.tab_users,
                "wins": self.tab_wins, "prompts": self.tab_prompts, "demo": self.tab_demo}
        for name in TABS:
            parts[name].visible = name == self.tab
            tabs[name].classes["on"] = name == self.tab
        self.feedback_panel.add_event_handler("x-changed", self._feedback_changed)
        self.wins_panel.add_event_handler("x-changed", self._wins_changed)
        getattr(self, "_" + self.tab)()

    # ---- overview
    def _overview(self):
        d = state.call("admin_overview")
        self.s_users.text, self.s_admins.text = str(d["users"]), str(d["admins"])
        self.s_admins_label.text = "admin" if d["admins"] == 1 else "admins"
        self.s_feedback.text, self.s_plans.text = str(d["feedback_new"]), str(d["plans"])
        self.s_wins.text, self.s_hidden.text, self.s_copies.text = str(d["wins"]), str(d["wins_hidden"]), str(d["copies"])
        self.demo_line.text = "Demo data is %s (%d demo people). Manage it in the Demo data tab." % (
            d["demo"]["state"], d["demo"]["counts"].get("users", 0))

    # ---- feedback
    def _feedback(self):
        d = state.call("list_feedback", None)
        self._fb = d
        items = [i for i in d["items"] if self._filter == "all" or i["status"] == self._filter]
        self.feedback_panel.items = items
        self.no_feedback.visible = not items
        labels = {"new": "New", "read": "Read", "done": "Done", "all": "All"}
        for key, el in (("new", self.f_new), ("read", self.f_read), ("done", self.f_done), ("all", self.f_all)):
            n = len(d["items"]) if key == "all" else d["counts"].get(key, 0)
            el.text = "%s (%d)" % (labels[key], n)
            el.role = ["seg", "on"] if key == self._filter else ["seg"]

    def _set_filter(self, value):
        self._filter = value
        self._feedback()

    @handle("f_new", "click")
    def f_new_click(self, **event_args):
        self._set_filter("new")

    @handle("f_read", "click")
    def f_read_click(self, **event_args):
        self._set_filter("read")

    @handle("f_done", "click")
    def f_done_click(self, **event_args):
        self._set_filter("done")

    @handle("f_all", "click")
    def f_all_click(self, **event_args):
        self._set_filter("all")

    def _feedback_changed(self, **event_args):
        self._feedback()

    # ---- users
    def _users(self, query=None):
        d = state.call("list_users", query or None)
        self.users_panel.items = d["users"]
        self.users_count.text = state.plural(d["total"], "person", "people")

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self._users(self.search_box.text)

    @handle("search_button", "click")
    def search_button_click(self, **event_args):
        self._users(self.search_box.text)

    # ---- wins
    def _wins(self):
        d = state.call("list_wins", None)
        self.wins_panel.items = d["wins"]
        self.no_wins.visible = not d["wins"]
        self.wins_note.visible = bool(d["wins"])

    def _wins_changed(self, **event_args):
        self._wins()

    # ---- prompts
    def _prompts(self):
        d = state.call("admin_prompt_stats")
        top = d["prompts"][0]["copies"] if d["prompts"] else 1
        self.prompts_panel.items = [dict(p, max=top) for p in d["prompts"]]
        self.prompts_line.text = ("How often each prompt was copied or opened in an AI chat (anonymous counts). %s in total."
                                  % state.plural(d["total"], "copy", "copies"))
        self.prompts_table.visible = bool(d["prompts"])
        self.no_prompts.visible = not d["prompts"]

    # ---- demo data
    def _demo(self):
        d = state.call("admin_overview")["demo"]
        counts = ", ".join("%s %s" % (v, k) for k, v in d["counts"].items())
        self.demo_status.text = "Status: %s · %s" % (d["state"], counts)
        self.demo_load_button.text = "Reload demo data" if d["state"] == "loaded" else "Load demo data"

    @handle("demo_load_button", "click")
    def demo_load_button_click(self, **event_args):
        if confirm("Demo people and content are added (any old demo rows are replaced).", title="Load the demo data?",
                   buttons=[("Cancel", False), ("Load", True)], role="app-dialog"):
            if state.call("demo_load"):
                state.toast("Done", "ok")
                self._demo()

    @handle("demo_remove_button", "click")
    def demo_remove_button_click(self, **event_args):
        if confirm("Every demo row is deleted. Real data stays.", title="Remove the demo data?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            if state.call("demo_remove"):
                state.toast("Done", "ok")
                self._demo()
