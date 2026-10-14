// Built by scripts/build-extension.sh from supabase/functions/_shared/job-sites.ts and apply-form.ts (sources 3b17128cf3fa51a4). Do not edit.
(() => {
  var __defProp = Object.defineProperty;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // supabase/functions/_shared/apply-form.ts
  var exports_apply_form = {};
  __export(exports_apply_form, {
    answerText: () => answerText,
    applicationQuestionKey: () => applicationQuestionKey,
    chooseOption: () => chooseOption,
    nationalNumber: () => nationalNumber,
    questionKey: () => questionKey,
    questionText: () => questionText,
    valueFor: () => valueFor
  });
  function questionKey(label) {
    let t = label.replace(/\s+/g, " ").trim();
    const half = t.length % 2 === 1 ? (t.length - 1) / 2 : -1;
    if (half > 0 && t.slice(0, half) === t.slice(half + 1))
      t = t.slice(0, half);
    return t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\brequired\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 300);
  }
  function applicationQuestionKey(label, jobId) {
    const key = questionKey(label);
    return jobId && /\b(visa|sponsor\w*|authori[sz]\w*|permit|citizen\w*|enroll\w*|study\w*|studies|student|internship|graduat\w*|start date|available|availability|relocat\w*)\b/.test(key) ? `${key.slice(0, 240)} job ${jobId.slice(0, 50)}` : key;
  }
  function questionText(label) {
    const t = label.replace(/\s+/g, " ").replace(/\s*\*+\s*$/, "").trim();
    const half = t.length % 2 === 1 ? (t.length - 1) / 2 : -1;
    return (half > 0 && t.slice(0, half) === t.slice(half + 1) ? t.slice(0, half) : t).slice(0, 500);
  }
  var DUTCH_OPTION = { none: /^(none|no|geen)/i, basic: /^(elementary|basic|conversational|beginner|limited)/i, professional: /^(professional|full professional|fluent|good|advanced)/i, native: /^(native|bilingual|moedertaal)/i };
  var digits = (t) => (/\d[\d.,\s]*/.exec(t)?.[0] ?? "").replace(/[.,\s](?=\d{3}\b)/g, "").replace(/[^\d.]/g, "");
  function nationalNumber(phone) {
    const t = phone.replace(/[^\d+]/g, "");
    return t.startsWith("+") ? t.replace(/^\+(31|32|33|34|39|44|49|1|351|353|36|48|45|46|47|41|43|30|420|421|90|91|84|86|62|60|63|65|66|55|52|27|234|20|7)/, "").replace(/^0/, "") : t.replace(/^0/, "");
  }
  function answerText(label, facts) {
    const key = questionKey(label);
    const a = facts.answers ?? {};
    const remembered = facts.remembered?.[applicationQuestionKey(label, facts.job_id)];
    const pick = (v) => v && v.trim() ? v.trim() : remembered || null;
    if (/\b(first name|given name|voornaam)\b/.test(key))
      return pick(a.first_name);
    if (/\b(last name|surname|family name|achternaam)\b/.test(key))
      return pick(a.last_name);
    if (/^(full )?name$/.test(key))
      return a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : pick(facts.name);
    if (/\b(e ?mail\w*)\b/.test(key))
      return pick(a.email) ?? pick(facts.email);
    if (/\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/.test(key) && !/country|landcode/.test(key))
      return pick(a.phone) ?? pick(facts.phone);
    if (/\blinkedin\b/.test(key) && /\b(url|profile|link)\b/.test(key))
      return pick(a.linkedin) ?? pick(facts.linkedin);
    if (/\b(website|portfolio|github|personal site)\b/.test(key))
      return pick(a.website);
    if (/\b(city|location|where do you live|woonplaats)\b/.test(key) && !/relocat/.test(key))
      return pick(a.city) ?? pick(facts.place?.split(",")[0]);
    if (/\b(postal code|postcode|zip code|zip)\b/.test(key))
      return pick(a.postcode);
    if (/^(street address|address|address line 1|adres|straat)/.test(key))
      return pick(a.address);
    if (/^(country|country of residence|land)$/.test(key))
      return pick(a.country);
    if (remembered)
      return remembered;
    if (/\b(internship|stage|placement|work placement)\b.*\b(agreement|contract|overeenkomst)\b|\bstage ?overeenkomst|\b(agreement|overeenkomst)\b.*\b(university|school|college)\b/.test(key))
      return pick(a.internship_agreement);
    if (/\b(graduat\w*|afstudeer\w*)\b/.test(key))
      return pick(a.graduation_date);
    if (/\b(are you|currently|presently)\b.*\b(student|enrolled|studying)\b|\b(enrolled|enrolment|enrollment|ingeschreven)\b/.test(key))
      return pick(a.study_status);
    if (/\b(field of study|major|study programme|study program|discipline|area of study|opleiding|studierichting)\b/.test(key))
      return pick(a.field_of_study);
    if (/\b(degree|diploma|level of education|education level|highest level|opleidingsniveau)\b/.test(key))
      return pick(a.degree);
    if (/\b(university|universiteit|school|college|institution|hogeschool|school name)\b/.test(key) && key.split(" ").length <= 6 && !/\b(high school|year|date|reference|referral|hear|find|about|why)\b/.test(key))
      return pick(a.university);
    if (/\b(nationality|nationaliteit|citizenship)\b/.test(key))
      return pick(a.nationality);
    if (/\b(relocat\w*)\b/.test(key))
      return pick(a.relocation);
    if (/\bnotice period\b|\bopzegtermijn\b/.test(key))
      return pick(a.notice_period);
    if (/\b(start date|when can you start|available to start|availability|earliest start|beschikbaar)\b/.test(key))
      return pick(a.start_date);
    if (/\bhours\b.*\bweek\b|\bper week\b|\buren\b/.test(key))
      return pick(a.hours_per_week);
    if (/\b(salary|compensation|pay|wage|salaris|stipend)\b/.test(key))
      return pick(a.expected_salary);
    if (/\b(sponsor\w*|visa)\b/.test(key)) {
      if (facts.job_id && facts.job_country !== "NL")
        return null;
      const w = a.work_authorization ?? "";
      if (!w)
        return null;
      if (/\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w) || /\bno(t)?\b.*\b(allowed|authori[sz]ed|permit)\b/i.test(w))
        return "Yes";
      if (/^\s*yes\b|\b(eu|eea) (citizen|national)|\bfree to work|\bno (sponsor|visa)\w* (needed|required)|\ballowed to work|\bauthori[sz]ed\b/i.test(w))
        return "No";
      return null;
    }
    if (/\b(authori[sz]ed|legally|right to work|eligible to work|work permit|allowed to work|werkvergunning)\b/.test(key)) {
      if (facts.job_id && facts.job_country !== "NL")
        return null;
      const w = a.work_authorization ?? "";
      if (!w)
        return null;
      if (/^\s*no\b|\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w))
        return "No";
      return /^\s*yes\b|\b(eu|eea)\b|\ballowed\b|\bauthori[sz]ed\b|\bfree to work\b|\bpermit\b/i.test(w) ? "Yes" : null;
    }
    if (/\bdutch\b|\bnederlands\b/.test(key) && /\b(level|proficiency|speak|fluent|niveau)\b/.test(key))
      return pick(facts.dutch);
    return null;
  }
  var norm = (t) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+]+/g, " ").trim();
  function chooseOption(options, answer, label = "") {
    const want = norm(answer);
    const opts = options.map(norm);
    const real = (i) => !/^(select an option|select|selecteer|choose|kies|kiezen)\b/.test(opts[i]) && opts[i] !== "";
    if (!want)
      return -1;
    if (/\b(dutch|nederlands)\b/i.test(label) && DUTCH_OPTION[want]) {
      const i = options.findIndex((o, n) => real(n) && DUTCH_OPTION[want].test(o.trim()));
      if (i >= 0)
        return i;
    }
    for (const test of [(o) => o === want, (o) => o.startsWith(want) || want.startsWith(o), (o) => o.includes(want)]) {
      const i = opts.findIndex((o, n) => real(n) && test(o));
      if (i >= 0)
        return i;
    }
    const yes = /^(yes|ja|true|y)\b/.test(want);
    const no = /^(no|nee|false|n)\b/.test(want);
    if (yes || no)
      return opts.findIndex((o, n) => real(n) && (yes ? /^(yes|ja)\b/ : /^(no|nee)\b/).test(o));
    const n = Number(digits(answer));
    if (answer.trim() && Number.isFinite(n)) {
      return options.findIndex((o, i) => {
        if (!real(i))
          return false;
        const r = /(\d+)\s*(?:-|–|to|tot)\s*(\d+)/.exec(o);
        if (r)
          return n >= Number(r[1]) && n <= Number(r[2]);
        const plus = /(\d+)\s*\+/.exec(o);
        return plus ? n >= Number(plus[1]) : false;
      });
    }
    return -1;
  }
  function valueFor(kind, label, answer, besideCountry = false) {
    if (kind === "number")
      return digits(answer);
    if (besideCountry && /\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/i.test(label))
      return nationalNumber(answer);
    return answer;
  }

  // supabase/functions/_shared/job-sites.ts
  var exports_job_sites = {};
  __export(exports_job_sites, {
    heldFilter: () => heldFilter,
    jobLink: () => jobLink,
    linkedinPublicJob: () => linkedinPublicJob,
    postingFrom: () => postingFrom,
    postingFromLinkedIn: () => postingFromLinkedIn,
    postingSent: () => postingSent,
    postingUsable: () => postingUsable,
    siteOfHost: () => siteOfHost,
    textOf: () => textOf
  });
  var LINKEDIN_HOST = /^(www\.|[a-z]{2,3}\.)?linkedin\.com$/;
  var INDEED_HOST = /^([a-z]{2,3}\.)?indeed\.(com|nl|de|fr|be|ch|at|ie|es|it|ca|pl|pt|se|dk|no|fi|lu|co\.uk|com\.au|co\.in|com\.sg|co\.za|com\.br|com\.mx)$/;
  var GLASSDOOR_HOST = /^(www\.)?glassdoor\.(com|nl|de|fr|be|ch|at|ie|es|it|ca|co\.uk|com\.au|co\.in|com\.sg|com\.br|com\.mx|sg)$/;
  var MAGNET_HOST = /^(www\.)?magnet\.me$/;
  var ACADEMIC_HOST = /^(www\.)?academictransfer\.com$/;
  var BOARDS = [
    ["greenhouse", /^(boards|job-boards)(\.eu)?\.greenhouse\.io$/, /^\/[^/]+\/jobs\/\d+$/],
    ["lever", /^jobs(\.eu)?\.lever\.co$/, /^\/[^/]+\/[0-9a-f-]{36}$/],
    ["ashby", /^jobs\.ashbyhq\.com$/, /^\/[^/]+\/[0-9a-f-]{36}$/],
    ["smartrecruiters", /^(jobs|careers)\.smartrecruiters\.com$/, /^\/[^/]+\/\d{6,}(-[^/]*)?$/],
    ["workday", /^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/, /\/job\/.+_[A-Za-z0-9-]+$/],
    ["personio", /^[a-z0-9-]+\.jobs\.personio\.(de|com)$/, /^\/job\/\d+$/],
    ["recruitee", /^[a-z0-9-]+\.recruitee\.com$/, /^\/o\/[^/]+$/],
    ["teamtailor", /^[a-z0-9-]+\.teamtailor\.com$/, /^\/jobs\/\d+[^/]*$/],
    ["workable", /^apply\.workable\.com$/, /^\/[^/]+\/j\/[0-9A-F]{6,}$/i],
    ["join", /^join\.com$/, /^\/companies\/[^/]+\/\d+[^/]*$/]
  ];
  var FORM = /\/(apply|application|applications\/new)$/;
  var JOB_QUERY = ["gh_jid", "jobid", "jobId", "job_id", "jid", "id", "vacancy", "vacancyid", "vacancyId", "job", "postingId", "req", "requisitionId"];
  function jobLink(input, anyPage = false) {
    let u;
    try {
      u = new URL(input.trim());
    } catch {
      return null;
    }
    if (u.protocol !== "https:")
      return null;
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    if (LINKEDIN_HOST.test(host)) {
      const view = /^\/jobs\/view\/(?:[^/?#]*-)?(\d{8,12})$/.exec(path);
      const current = path.startsWith("/jobs") ? u.searchParams.get("currentJobId") : null;
      const id = view?.[1] ?? (current && /^\d{8,12}$/.test(current) ? current : null);
      return id ? { site: "linkedin", ats: "linkedin", id, url: `https://www.linkedin.com/jobs/view/${id}` } : null;
    }
    if (INDEED_HOST.test(host)) {
      const jk = u.searchParams.get("jk") ?? u.searchParams.get("vjk");
      if (!jk || !/^[0-9a-f]{16}$/.test(jk))
        return null;
      return { site: "indeed", ats: "indeed", id: jk, url: `https://${host.includes(".") && host.split(".").length > 2 ? host : `www.${host}`}/viewjob?jk=${jk}` };
    }
    if (GLASSDOOR_HOST.test(host)) {
      const jl = u.searchParams.get("jl") ?? u.searchParams.get("jobListingId");
      if (!jl || !/^\d{6,20}$/.test(jl))
        return null;
      const listing = /^\/job-listing\/[^/]+\.htm$/.test(path) ? path : "/job-listing/j.htm";
      return { site: "glassdoor", ats: "glassdoor", id: jl, url: `https://${host.startsWith("www.") ? host : `www.${host}`}${listing}?jl=${jl}` };
    }
    if (MAGNET_HOST.test(host)) {
      const m = /^\/([a-z]{2}(?:-[A-Z]{2})?)\/(vacature|opportunity|vacancy|job|stage|internship|traineeship)\/(\d{3,})(\/[^/]+)?$/i.exec(path);
      return m ? { site: "magnet.me", ats: "magnet.me", id: m[3], url: `https://magnet.me/${m[1]}/${m[2]}/${m[3]}${m[4] ?? ""}` } : null;
    }
    if (ACADEMIC_HOST.test(host)) {
      const m = /^\/([a-z]{2})\/jobs\/(\d{3,})(\/[^/]+)?$/.exec(path);
      return m ? { site: "academictransfer", ats: "academictransfer", id: m[2], url: `https://www.academictransfer.com/${m[1]}/jobs/${m[2]}${m[3] ?? ""}/` } : null;
    }
    const job = path.replace(FORM, "");
    for (const [ats, hostRx, pathRx] of BOARDS) {
      if (hostRx.test(host))
        return pathRx.test(job) ? { site: ats, ats, id: job, url: `https://${host}${job}` } : null;
    }
    if (!anyPage || !/\.[a-z]{2,}$/.test(host))
      return null;
    const keep = JOB_QUERY.filter((k) => u.searchParams.get(k)).map((k) => `${k}=${encodeURIComponent(u.searchParams.get(k) ?? "")}`);
    if (job === "" && keep.length === 0)
      return null;
    const canonicalPath = job === "/job" && u.searchParams.get("gh_jid") ? "/" : job || "/";
    const where = `${canonicalPath}${keep.length ? `?${keep.join("&")}` : ""}`;
    return { site: "web", ats: "other", id: where, url: `https://${host}${where}` };
  }
  function heldFilter(link) {
    const id = encodeURIComponent(link.id);
    if (link.site === "indeed")
      return `url=like.*indeed.*jk=${id}*`;
    if (link.site === "glassdoor")
      return `url=like.*glassdoor.*jl=${id}*`;
    if (link.site === "magnet.me")
      return `or=(url.like.*magnet.me/*/${id}/*,url.like.*magnet.me/*/${id})`;
    if (link.site === "academictransfer")
      return `url=like.*academictransfer.com/*/jobs/${id}/*`;
    return `url=eq.${encodeURIComponent(link.url)}`;
  }
  function siteOfHost(hostname) {
    const host = hostname.toLowerCase();
    if (LINKEDIN_HOST.test(host))
      return "linkedin";
    if (INDEED_HOST.test(host))
      return "indeed";
    if (GLASSDOOR_HOST.test(host))
      return "glassdoor";
    if (MAGNET_HOST.test(host))
      return "magnet.me";
    if (ACADEMIC_HOST.test(host))
      return "academictransfer";
    return BOARDS.find(([, rx]) => rx.test(host))?.[0] ?? null;
  }
  var COUNTRY = { NL: "Netherlands", NLD: "Netherlands", BE: "Belgium", DE: "Germany", FR: "France", GB: "United Kingdom", UK: "United Kingdom", IE: "Ireland", US: "United States", ES: "Spain", IT: "Italy", CH: "Switzerland", AT: "Austria", LU: "Luxembourg", DK: "Denmark", SE: "Sweden", PL: "Poland", PT: "Portugal" };
  var PROVINCE = { NH: "North Holland", ZH: "South Holland", UT: "Utrecht", NB: "North Brabant", LI: "Limburg", GE: "Gelderland", OV: "Overijssel", DR: "Drenthe", FR: "Friesland", GR: "Groningen", ZE: "Zeeland", FL: "Flevoland" };
  var ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•" };
  function textOf(html) {
    return html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, `
`).replace(/<li[^>]*>/gi, `
• `).replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section)>/gi, `
`).replace(/<[^>]+>/g, " ").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, e) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 1114112 ? String.fromCodePoint(n) : " ";
      }
      return ENTITY[e.toLowerCase()] ?? whole;
    }).replace(/[ \t ]+/g, " ").replace(/ *\n */g, `
`).replace(/\n{2,}/g, `
`).trim();
  }
  var str = (v) => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  var nameOf = (v) => typeof v === "string" ? v.trim() : v && typeof v === "object" ? str(v.name) : "";
  var isPosting = (o) => [o["@type"]].flat().some((t) => typeof t === "string" && /(^|\/)JobPosting$/i.test(t));
  function* objects(v, depth = 0) {
    if (depth > 6 || !v || typeof v !== "object")
      return;
    if (Array.isArray(v)) {
      for (const x of v)
        yield* objects(x, depth + 1);
      return;
    }
    const o = v;
    yield o;
    for (const key of ["@graph", "mainEntity", "itemListElement", "item"])
      if (key in o)
        yield* objects(o[key], depth + 1);
  }
  function placeOf(p) {
    const places = [p.jobLocation].flat().filter(Boolean);
    const read = places.map((pl) => {
      const a = pl?.address ?? pl;
      if (typeof a === "string")
        return a.trim();
      const code = nameOf(a?.addressCountry);
      const country = COUNTRY[code.toUpperCase()] ?? code;
      const region = str(a?.addressRegion);
      const parts = [str(a?.addressLocality), country === "Netherlands" ? PROVINCE[region.toUpperCase()] ?? region : region, country];
      return parts.filter((x, i) => x && parts.indexOf(x) === i).join(", ");
    }).filter(Boolean);
    const remote = [p.jobLocationType].flat().some((t) => /telecommute/i.test(str(t)));
    if (read.length)
      return read[0];
    if (remote) {
      const where = [p.applicantLocationRequirements].flat().map(nameOf).filter(Boolean)[0];
      return where ? `Remote, ${COUNTRY[where.toUpperCase()] ?? where}` : "Remote";
    }
    return "";
  }
  function postingFrom(data) {
    for (const o of objects(data)) {
      if (!isPosting(o))
        continue;
      const org = o.hiringOrganization;
      const posting = {
        title: textOf(str(o.title) || str(o.name)),
        company: textOf(nameOf(org)),
        location: placeOf(o),
        description: textOf(str(o.description)),
        posted: str(o.datePosted) || null,
        valid: str(o.validThrough) || null,
        logo: org && typeof org === "object" && (str(org.logo) || str(org.logo?.url)) || null,
        employment: [o.employmentType].flat().map(str).filter(Boolean).join(", ") || null
      };
      if (posting.title && posting.company)
        return posting;
    }
    return null;
  }
  function postingUsable(p) {
    return Boolean(p && p.title.length >= 2 && p.title.length <= 300 && p.company.length >= 1 && p.company.length <= 200 && p.description.length >= 120 && p.description.length <= 1e5 && p.location.length <= 300);
  }
  function postingSent(x) {
    if (!x || typeof x !== "object" || Array.isArray(x))
      return null;
    const o = x;
    const text = (k, max) => typeof o[k] === "string" ? [...o[k]].filter((c) => c >= " " || c === `
` || c === "\t").join("").trim().slice(0, max) : "";
    const date = (k) => /^\d{4}-\d{2}-\d{2}/.test(text(k, 40)) ? text(k, 40) : null;
    const logo = text("logo", 2000);
    const p = { title: text("title", 400), company: text("company", 300), location: text("location", 400), description: text("description", 1e5), posted: date("posted"), valid: date("valid"), logo: /^https:\/\//.test(logo) ? logo : null, employment: text("employment", 200) || null, applicants: text("applicants", 120) || null, seniority: text("seniority", 80) || null, closed: o.closed === true };
    return postingUsable(p) ? p : null;
  }
  var linkedinPublicJob = (id) => `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`;
  function postingFromLinkedIn(html) {
    const grab = (rx) => textOf(rx.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const logo = /artdeco-entity-image[^>]*data-delayed-url="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, "&") ?? null;
    const posting = {
      title: grab(/topcard__title[^>]*>([\s\S]*?)<\//),
      company: grab(/topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/) || grab(/topcard__flavor[^>]*>([\s\S]*?)<\//),
      location: grab(/topcard__flavor topcard__flavor--bullet[^>]*>([\s\S]*?)<\//),
      description: textOf(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ""),
      posted: null,
      valid: null,
      logo: logo && /^https:\/\//.test(logo) ? logo : null,
      employment: grab(/Employment type\s*<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/) || null,
      applicants: grab(/num-applicants__caption[^>]*>([\s\S]*?)<\//) || null,
      seniority: grab(/Seniority level\s*<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/) || null,
      closed: /closed-job|No longer accepting applications/i.test(html)
    };
    return posting.title && posting.company ? posting : null;
  }

  // scripts/extension-sites.ts
  globalThis.oddsSites = exports_job_sites;
  globalThis.oddsApply = exports_apply_form;
})();
