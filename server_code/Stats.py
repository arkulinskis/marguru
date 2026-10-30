"""Anonymous counts of which prompts people copy or open (no user is stored), so the admin can see
which parts of the playbook are used."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from .Plans import PROMPT_ID


@anvil.server.callable
def track_copy(prompt_id):
    if not isinstance(prompt_id, str) or not PROMPT_ID.match(prompt_id):
        return C.fail("Unknown prompt.")
    if C.rate_limited("track_copy", 200, 3600):
        return C.ok()
    r = app_tables.prompt_stats.get(prompt_id=prompt_id)
    if r is None:
        app_tables.prompt_stats.add_row(prompt_id=prompt_id, copies=1, last_copied=C.now())
    else:
        r.update(copies=(r["copies"] or 0) + 1, last_copied=C.now())
    return C.ok()


def total_copies():
    return sum((r["copies"] or 0) for r in app_tables.prompt_stats.search())


@anvil.server.callable(require_user=True)
def admin_prompt_stats():
    C.require_admin()
    rows = app_tables.prompt_stats.search(tables.order_by("copies", ascending=False))
    return {"prompts": [{"id": r["prompt_id"], "copies": r["copies"] or 0, "last": C.iso(r["last_copied"])} for r in rows[:100]],
            "total": total_copies()}
