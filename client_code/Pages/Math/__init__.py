from anvil import *

from ._anvil_designer import MathTemplate
from ... import mg, state

# key, label, unit, min, max, step, default, hint. Default click cost and conversion rate: LocaliQ/WordStream 2025
# Google Ads search benchmarks, all industries (US). Don't change a default without checking its source.
FIELDS = [
    ("budget", "Monthly ad budget", "$", 50, 10000, 50, 500, ""),
    ("cpc", "Cost per click", "$", 0.25, 30, 0.05, 5.26, "US search average, 2025"),
    ("cvr", "Clicks that become leads", "%", 0.5, 40, 0.1, 7.5, "US search average, 2025"),
    ("close", "Leads that become customers", "%", 1, 100, 1, 30, "your guess"),
    ("sale", "Average sale", "$", 5, 20000, 5, 100, ""),
    ("repeat", "Purchases per customer, lifetime", "×", 1, 50, 1, 1, ""),
    ("margin", "Gross margin", "%", 5, 95, 1, 50, "after cost of goods or labour"),
    ("fee", "Agency or freelancer fee", "$", 0, 10000, 50, 0, "per month"),
]


def _fmt(n, digits):
    """1234.5 -> '1,234.5' (at most `digits` decimals, trailing zeros dropped), like toLocaleString('en-US')."""
    s = ("%." + str(digits) + "f") % n
    whole, _, frac = s.partition(".")
    sign = "-" if whole.startswith("-") else ""
    whole = whole.lstrip("-")
    groups = []
    while len(whole) > 3:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    groups.insert(0, whole)
    frac = frac.rstrip("0")
    return sign + ",".join(groups) + ("." + frac if frac else "")


def _float(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def money(n):
    return ("-" if n < 0 else "") + "$" + _fmt(abs(n), 2 if abs(n) < 100 else 0)


def num(n, d=1):
    return _fmt(n, d)


class Math(MathTemplate):
    """#math ("Ad math"): is an ad budget worth it? Budget -> clicks -> leads -> customers -> profit, the break-even
    cost per click and per lead, and what an agency fee does to the numbers. Pure browser math; values are kept in
    this browser (mg store 'math', same as the JS version)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        saved = mg.store_get("math") or {}
        self.vals: dict = {f[0]: _float(saved.get(f[0]), f[6]) for f in FIELDS}
        self.fields_panel.items = [{"key": f[0], "label": f[1], "unit": f[2], "min": f[3], "max": f[4], "step": f[5],
                                    "value": self.vals[f[0]], "hint": f[7]} for f in FIELDS]
        self.fields_panel.add_event_handler("x-value", self._value)
        state.heading(self.verdict_title, 3)
        self.calc()

    def _value(self, key, value, **event_args):
        self.vals[key] = value
        self.calc()

    @handle("reset_button", "click")
    def reset_button_click(self, **event_args):
        self.vals = {f[0]: float(f[6]) for f in FIELDS}
        for c in self.fields_panel.get_components():
            item = getattr(c, "item")
            getattr(c, "set_value")(self.vals[item["key"]])
        self.calc()

    def calc(self):
        v: dict = self.vals
        clicks = v["budget"] / max(0.01, v["cpc"])
        leads = clicks * v["cvr"] / 100.0
        cust = leads * v["close"] / 100.0
        lifetime = v["sale"] * v["repeat"]
        revenue = cust * lifetime
        gross = revenue * v["margin"] / 100.0
        spend = v["budget"] + v["fee"]
        net = gross - spend
        max_cpl = lifetime * v["margin"] / 100.0 * v["close"] / 100.0
        be_cpc = max_cpl * v["cvr"] / 100.0
        top = max(clicks, 1)
        self.funnel_panel.items = [{"label": label, "text": num(n, 1 if n < 10 else 0), "width": max(1.0, 100.0 * n / top), "tone": i + 1}
                                   for i, (label, n) in enumerate([("Clicks", clicks), ("Leads", leads), ("Customers", cust)])]
        kp = [[money(v["budget"] / max(leads, 1e-9)), "cost per lead"], [money(spend / max(cust, 1e-9)), "cost per customer (with fees)"],
              [money(revenue), "revenue (lifetime)"], [money(net), "profit after ads and fees"],
              [money(be_cpc), "break-even cost per click"], [money(max_cpl), "most you can pay per lead"]]
        if leads < 0.05:
            kp[0][0] = "—"
        if cust < 0.05:
            kp[1][0] = "—"
        self.kpi_panel.items = kp
        good = net > 0
        fee_share = int(round(100.0 * v["fee"] / spend)) if spend else 0
        tips = []
        if v["cpc"] > be_cpc:
            tips.append("Clicks cost %s but you break even at %s. Look for cheaper, more specific keywords, or a smaller area." % (money(v["cpc"]), money(be_cpc)))
        if v["cvr"] < 5:
            tips.append("Only %s%% of clicks become leads. A dedicated landing page (Stage 3 in your playbook) is the usual fix." % num(v["cvr"]))
        if v["close"] < 25:
            tips.append("Closing %s%% of leads: faster replies and a clear price range often help." % num(v["close"], 0))
        if v["repeat"] <= 1:
            tips.append("If customers buy only once, a reminder or referral programme (Stage 7) raises what each one is worth.")
        if fee_share >= 40:
            tips.append("Fees are %d%% of your total marketing spend. With a small ad budget, most of your money pays the manager, not the ads." % fee_share)
        self.verdict.classes.update({"good": good, "bad": not good})
        self.verdict_title.text = "Worth testing, carefully." if good else "Loses money at these numbers."
        if good:
            self.verdict_text.text = ("At these numbers each month of ads returns about %s of profit after ads%s. Real results swing a lot in "
                                      "the first weeks; judge after 4-8 weeks of tracked data." % (money(net), " and fees" if v["fee"] else ""))
        else:
            self.verdict_text.text = ("You'd lose about %s a month. That doesn't mean \"never advertise\": fix one of the levers below first, "
                                      "or start with free work (Google profile, reviews, website)." % money(-net))
        self.tips_panel.items = [{"text": t, "role": ["am-tip"]} for t in tips]
        mg.store_set("math", self.vals)
