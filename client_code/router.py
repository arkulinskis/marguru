"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules. Same addresses as the JavaScript
version, so shared links keep working.

Links in templates are plain <a href="#plan/example">; code calls router.go("plan", plan_id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu (header + phone tab bar): (page, label, icon, who). Visitors see the public ones, plus
          "Try it" (#build) in the phone tab bar.
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "Market your business like an agency would"),
    "auth": ("guest", "Sign in"),
    "build": (None, "Describe your business"),
    "plan": (None, "Your playbook"),
    "home": ("user", "Your desk"),
    "guide": (None, "What agencies actually do"),
    "math": (None, "Ad math"),
    "wins": (None, "Wins"),
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("home", "Desk", "home", "user"), ("guide", "Field guide", "book", None), ("math", "Ad math", "calc", None),
       ("wins", "Wins", "trophy", None)]
APP_NAME = "Marguru"
_r: dict = {"after": "", "listening": False, "page": None}


def nav_links(page):
    """The header menu: members get Desk first, visitors the public pages."""
    me = state.me()
    return [{"page": p, "label": label, "icon": icon, "on": p == page} for p, label, icon, who in NAV if me or not who]


def tab_links(page):
    """The phone tab bar: visitors get "Try it" (#build, also lit on #plan) before the public pages."""
    links = nav_links(page)
    if not state.me():
        links = [{"page": "build", "label": "Try it", "icon": "sparkle", "on": page in ("build", "plan")}] + links
    return links[:4]


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "build":
        from .Pages.Build import Build
        return Build
    if name == "plan":
        from .Pages.Plan import Plan
        return Plan
    if name == "home":
        from .Pages.Home import Home
        return Home
    if name == "guide":
        from .Pages.Guide import Guide
        return Guide
    if name == "math":
        from .Pages.Math import Math
        return Math
    if name == "wins":
        from .Pages.Wins import Wins
        return Wins
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return "home" if state.me() else "landing"


def show():
    """Open the page for the current address."""
    from . import mg
    asked = parse(window.location.hash)[0]
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if name == "plan":
        arg = args[0] if args else "local"
        if arg == "local" and not (mg.store_get("guestPlan") or {}).get("profile"):
            name, args = "build", []  # no plan in this browser yet: describe the business first
        elif arg not in ("local", "example") and not state.me():
            who = "user"  # a saved plan needs its owner signed in
    if who == "guest" and state.me():
        name, args = "home", []
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = "home", []
    if asked and asked != name:
        window.history.replaceState(None, "", href(name, *args))  # page and address agree after a redirect
    window.document.title = PAGES[name][1] + " · " + APP_NAME
    window.UI_READY = False
    old = _r["page"]
    if old is not None and hasattr(old, "leave"):
        old.leave()
    page = _form(name)(args=args)
    _r["page"] = page
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    if hasattr(page, "shown"):
        page.shown()  # after open_form: scroll to a section, focus a field
    window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or home."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go("home")


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        _r["listening"] = True
    show()
