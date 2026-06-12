const CATEGORIES = [
  {
    name: "banking_riba",
    carveOut:
      /\b(islamic|sharia|shariah|takaful)\b|al ?rayan|gatehouse bank|islamic finance|halal (?:finance|investment|mortgage|bank)|food ?bank|blood ?bank|bottle ?bank|data ?bank|bank holiday|river ?bank|piggy ?bank|seed ?bank|memory bank/,
    pattern: new RegExp(
      [
        String.raw`\bbank\b`,
        String.raw`\bbanking\b`,
        String.raw`\bbanker\b`,
        String.raw`\bmortgages?\b`,
        String.raw`\bloans?\b`,
        String.raw`\blending\b`,
        String.raw`\blender\b`,
        String.raw`\bpayday\b`,
        "hedge funds?",
        String.raw`\bbrokerage\b`,
        "stock ?broker",
        String.raw`\binsurance\b`,
        String.raw`\binsurer\b`,
        String.raw`\bunderwrit(?:er|ing|ers)\b`,
        String.raw`\bactuar(?:y|ial|ies)\b`,
        "building society",
        String.raw`\bbarclays\b`,
        String.raw`\bhsbc\b`,
        String.raw`\blloyds\b`,
        String.raw`\bnatwest\b`,
        String.raw`\bsantander\b`,
        String.raw`\bnationwide\b`,
        String.raw`\bhalifax\b`,
        "royal bank",
        String.raw`\brbs\b`,
        String.raw`\bmonzo\b`,
        String.raw`\bstarling\b`,
        String.raw`\brevolut\b`,
        "capital one",
        String.raw`\baviva\b`,
        String.raw`\baxa\b`,
        "legal (?:&|and) general",
        String.raw`\bprudential\b`,
        "direct line",
        "scottish widows",
        "standard life",
        "metro bank",
        String.raw`\btsb\b`,
      ].join("|"),
      "i"
    ),
  },
  {
    name: "alcohol",
    carveOut: /non[\s-]?alcoholic|alcohol[\s-]?free|alcohol (?:awareness|support|misuse|recovery|worker)/,
    pattern: new RegExp(
      [
        String.raw`\bbartender\b`,
        "bar staff",
        "bar manager",
        "bar supervisor",
        "bar team",
        String.raw`\bbarback\b`,
        String.raw`\bsommelier\b`,
        String.raw`\bmixologist\b`,
        String.raw`\bpub\b`,
        String.raw`\bbrewery\b`,
        String.raw`\bbrewer\b`,
        String.raw`\bdistillery\b`,
        String.raw`\bdistiller\b`,
        String.raw`\bwinery\b`,
        String.raw`\bwine\b`,
        String.raw`\bbeer\b`,
        String.raw`\bspirits\b`,
        String.raw`\bcocktail\b`,
        "off[\\s-]licence",
        "bottle shop",
        String.raw`\bnightclub\b`,
        "licensed premises",
        "wine merchant",
        String.raw`\bvodka\b`,
        String.raw`\bwhisk(?:y|ey)\b`,
        String.raw`\blager\b`,
      ].join("|"),
      "i"
    ),
  },
  {
    name: "gambling",
    carveOut:
      /game (?:developer|designer|dev|programmer|artist|tester|producer|engineer)|games? (?:developer|designer|studio|programmer)|video ?game|game studio|gameplay|unity developer|unreal/,
    pattern: new RegExp(
      [
        String.raw`\bcasino\b`,
        String.raw`\bbetting\b`,
        String.raw`\bbookmakers?\b`,
        String.raw`\bgambling\b`,
        String.raw`\bwager(?:ing)?\b`,
        String.raw`\bpoker\b`,
        String.raw`\bbingo\b`,
        String.raw`\blottery\b`,
        String.raw`\bsportsbook\b`,
        "slot machine",
        "betting shop",
        String.raw`\bbet365\b`,
        "william hill",
        String.raw`\bladbrokes\b`,
        "paddy power",
        String.raw`\bbetfair\b`,
        "sky bet",
        String.raw`\bentain\b`,
        "gala bingo",
        "mecca bingo",
      ].join("|"),
      "i"
    ),
  },
  {
    name: "pork_non_halal",
    carveOut: /\bhalal\b/,
    pattern: new RegExp(
      [
        String.raw`\bpork\b`,
        String.raw`\bbacon\b`,
        String.raw`\bgammon\b`,
        String.raw`\bsausages?\b`,
        String.raw`\bcharcuterie\b`,
        "pig farm",
        "pig farming",
        "pork (?:production|processing)",
      ].join("|"),
      "i"
    ),
  },
  {
    name: "warehouse",
    pattern: new RegExp(
      [
        String.raw`\bwarehouse\b`,
        String.raw`\bwarehousing\b`,
        "warehouse operative",
        String.raw`\bpicker\b`,
        String.raw`\bpacker\b`,
        "pick (?:and|&) pack",
        "fulfilment (?:centre|operative)",
        "fulfillment (?:center|operative)",
        "distribution centre operative",
        "goods[\\s-]in operative",
      ].join("|"),
      "i"
    ),
  },
  {
    name: "retail_shop_floor",
    pattern: new RegExp(
      [
        "retail assistant",
        "shop assistant",
        "store assistant",
        "sales assistant",
        "retail sales assistant",
        "shop floor assistant",
        "customer assistant",
        String.raw`\bcashier\b`,
        String.raw`\bcheckout\b`,
        String.raw`\bsupermarket\b`,
      ].join("|"),
      "i"
    ),
  },
  {
    name: "adult_content",
    pattern: new RegExp(
      [
        "adult entertainment",
        "adult content",
        "adult film",
        "adult webcam",
        "webcam model",
        String.raw`\bstripper\b`,
        "exotic dancer",
        "escort agency",
        String.raw`\bbrothel\b`,
        "adult (?:store|shop)",
        "glamour model",
      ].join("|"),
      "i"
    ),
  },
];

const COMMISSION_ONLY = new RegExp(
  [
    "commission[\\s-]only",
    "100\\s*%\\s*commission",
    "commission[\\s-]based",
    "purely commission",
    "pure commission",
    "ote only",
    "ote[\\s-]only",
    "no basic salary",
    "no base salary",
    "nil basic",
    "self[\\s-]employed.{0,30}commission",
    "commission only role",
  ].join("|"),
  "i"
);

function haystack(job) {
  return `${job.title} ${job.company ?? ""} ${job.industry ?? ""} ${job.description ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function checkExclusion(job) {
  const hay = haystack(job);
  for (const cat of CATEGORIES) {
    if (cat.carveOut && cat.carveOut.test(hay)) continue;
    if (cat.pattern.test(hay)) return { excluded: true, reason: cat.name };
  }
  const payText = `${job.title} ${job.description ?? ""}`.toLowerCase().replace(/\s+/g, " ");
  if (COMMISSION_ONLY.test(payText)) return { excluded: true, reason: "commission_only" };
  return { excluded: false, reason: null };
}

function J(title, company = null, description = null, industry = null) {
  return { title, company, description, industry };
}

const SHOULD_EXCLUDE = [
  ["Investment Banking Analyst", J("Investment Banking Analyst", "Goldman")],
  ["Wine Bar Manager", J("Bar Manager", "The Vineyard")],
  ["Casino Croupier", J("Croupier", "Genting Casino")],
  ["Stripper", J("Stripper")],
  ["Pork butcher", J("Butcher", "Pork processing plant")],
  ["Warehouse Operative", J("Warehouse Operative", "Amazon")],
  ["Sales Assistant", J("Sales Assistant", "Tesco")],
  ["100%commission (no space)", J("Sales Executive", null, "This is a 100%commission role")],
  ["Off Licence Assistant", J("Assistant", "Bargain Booze off-licence")],
  ["Head Brewer", J("Head Brewer", "BrewDog")],
  ["Bookmaker cashier", J("Cashier", "Ladbrokes")],
  ["Insurance underwriter", J("Underwriter", "Aviva")],
  ["Loan officer", J("Loan Officer", "Provident")],
  ["Adult Store sales", J("Sales Assistant", "Adult Store")],
  ["Glamour model", J("Glamour Model")],
  ["Bingo caller", J("Bingo Caller", "Mecca Bingo")],
  ["100 percent commission spaced", J("Sales", null, "earn 100 % commission")],
  ["betting cashier", J("Cashier", "Coral Betting")],
  ["payday loans", J("Collections Agent", "Payday Loans Ltd")],
  ["nil basic salary", J("Field Sales", null, "nil basic, uncapped earnings")],
];

const SHOULD_KEEP = [
  ["Food Bank Coordinator", J("Food Bank Coordinator", "Trussell Trust")],
  ["Blood Bank Technician", J("Blood Bank Technician", "NHS")],
  ["Public Health Officer", J("Public Health Officer", "Birmingham City Council")],
  ["Publishing Assistant", J("Publishing Assistant", "Penguin")],
  ["Republic Coworking office mgr", J("Office Manager", "Republic Coworking")],
  ["Game Developer", J("Game Developer", "Codemasters")],
  ["Unity Developer", J("Unity Developer", "Rare")],
  ["Barista at Costa", J("Barista", "Costa Coffee")],
  ["Barber", J("Barber", "Turkish Barber")],
  ["Library Assistant", J("Library Assistant", "Birmingham Libraries")],
  ["Pharmacist Boots", J("Pharmacist", "Boots")],
  ["Teacher Hampton-in-Arden", J("Teacher", "School in Hampton-in-Arden")],
  ["Chef halal meals", J("Chef", null, "prepare halal meals daily")],
  ["Graduate embarking career", J("Graduate Scheme", null, "embarking on an exciting career")],
  ["NHS Bank Nurse (staff bank)", J("Bank Nurse", "Birmingham NHS Trust", "join our flexible staff bank")],
  ["Urbanist / urban planner", J("Urban Planner", "Birmingham City Council")],
  ["Carer (no haram)", J("Care Assistant", "Sunrise Care Home")],
  ["Software eng builds checkout", J("Software Engineer", null, "build the checkout flow for our e-commerce client")],
  ["Disbarment paralegal", J("Paralegal", null, "handles disbarment cases")],
  ["Cabaret performer (not strip)", J("Cabaret Performer", "Hippodrome")],
];

console.log("=== SHOULD EXCLUDE (flag any 'kept') ===");
for (const [label, job] of SHOULD_EXCLUDE) {
  const r = checkExclusion(job);
  const mark = r.excluded ? "ok  EXCLUDED(" + r.reason + ")" : "!!! KEPT (false negative)";
  console.log(`${mark.padEnd(34)} | ${label}`);
}
console.log("\n=== SHOULD KEEP (flag any 'EXCLUDED') ===");
for (const [label, job] of SHOULD_KEEP) {
  const r = checkExclusion(job);
  const mark = r.excluded ? "!!! EXCLUDED(" + r.reason + ") (false positive)" : "ok  kept";
  console.log(`${mark.padEnd(40)} | ${label}`);
}
