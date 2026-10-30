"""Demo content, so the Wins board never looks empty. Loaded automatically the first time anyone opens it
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row
is flagged is_demo=True, so remove() deletes exactly what load() added. The wins are made up (the page labels
them "Example"): they show the format and the kind of habits that work, not real results.
"""
import datetime as dt

from anvil.tables import app_tables

from . import common as C

DEMO_USERS = [
    ("Rosa P.", "rosa.demo@example.com"),
    ("Dev Malhotra", "dev.demo@example.com"),
    ("Léa Tremblay", "lea.demo@example.com"),
    ("Sam Okafor", "sam.demo@example.com"),
    ("Mira K.", "mira.demo@example.com"),
]
# (author, business_type, channel, title, story, result, days ago, claps)
DEMO_WINS = [
    (0, "food", "maps", "Asking at the till took us from 14 to 61 reviews",
     "We put a small QR card by the register and asked every single customer at pickup, not just the regulars. "
     "No discounts for reviews (that's against Google's rules), just 'it really helps a small bakery'. "
     "We reply to every review within two days, including the two grumpy ones.",
     "14 to 61 Google reviews in 3 months; more direction requests on our profile", 3, 9),
    (1, "trades", "gads", "The search terms report was full of job seekers",
     "Our first month of Google Ads felt expensive. The Search terms report showed clicks for 'plumber jobs', "
     "'plumbing course' and 'how to fix a leaking tap'. I added about 40 negative keywords and switched the location setting to people actually in our area.",
     "Cost per call went from about $48 to $31 over the next six weeks", 6, 14),
    (3, "trades", "maps", "Nine listings had our old address",
     "Our Google ranking stalled. Turned out Yelp, two directories and an old Facebook page still had our previous address, "
     "and 'Ave' vs 'Avenue' everywhere. I fixed them one by one with the exact same name, address and phone.",
     "Back in the top 3 on Maps for our main search within a few weeks", 9, 7),
    (2, "beauty", "content", "Regulars filmed our best ads",
     "Instead of paying for a shoot, we asked three regulars to film a 20-second clip on their phones about why they come. "
     "We asked permission, gave them nothing for it, and used the clips as Reels and then as Meta ads.",
     "The phone clips beat our polished photo ads on cost per booking", 12, 11),
    (4, "ecom", "email", "A 4-email welcome series did the selling for us",
     "We had 900 subscribers and only sent emails when we remembered. I wrote a welcome series: hello, our story, "
     "bestsellers with reviews, then a small first-order offer on day 7. Set it up once as an automation.",
     "The series now brings in a steady share of first orders every week", 15, 6),
    (1, "pro", "site", "We answered 'how much does it cost?' on the website",
     "Like most accountants, we hid our prices. I wrote an FAQ page with honest price ranges for the five things people ask about, "
     "plus what makes a job cost more. Linked it from the homepage and our Google profile.",
     "Fewer tire-kicker calls, and new clients mention they read the FAQ first", 19, 8),
    (2, "food", "maps", "Weekly Google posts with real photos",
     "Every Monday I post on our Google Business Profile: the weekend special with a phone photo of the actual dish. "
     "Takes ten minutes. People started saying 'I saw it on Google'.",
     "Customers order the posted special by name", 24, 5),
    (3, "fitness", "social", "One broad ad set instead of six tiny ones",
     "We were splitting $400 a month across six Meta ad sets with different interests; nothing ever left the learning phase. "
     "Moved to one broad ad set around our studio and optimised for leads instead of purchases.",
     "Steady trial bookings instead of random spikes", 30, 10),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["wins", "plans"]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Called by the main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def load():
    remove(remember=False)
    users = []
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=40))
        users.append(u)
    for who, btype, channel, title, story, result, days, claps in DEMO_WINS:
        # Claps from made-up people ("demo0", ...), so they never count as a real member's clap.
        app_tables.wins.add_row(author=users[who], business_type=btype, channel=channel, title=title, story=story, result=result,
                                created=C.now() - dt.timedelta(days=days, hours=who * 3), clappers=["demo%d" % i for i in range(claps)],
                                hidden=False, is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
