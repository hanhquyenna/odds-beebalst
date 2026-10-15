// Built by scripts/build-extension.sh from supabase/functions/_shared/job-sites.ts, apply-form.ts and apply-censor.ts (sources 64cb8fd3beef7117). Do not edit.
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
    agentCanAnswer: () => agentCanAnswer,
    answerText: () => answerText,
    applicationQuestionKey: () => applicationQuestionKey,
    chooseOption: () => chooseOption,
    demographicChoice: () => demographicChoice,
    dialCodeOf: () => dialCodeOf,
    graduationParts: () => graduationParts,
    heardChoice: () => heardChoice,
    isConsentCheckbox: () => isConsentCheckbox,
    isHearQuestion: () => isHearQuestion,
    isTrapQuestion: () => isTrapQuestion,
    nationalNumber: () => nationalNumber,
    nlProvinceOf: () => nlProvinceOf,
    preferenceChoice: () => preferenceChoice,
    privacyChoice: () => privacyChoice,
    questionKey: () => questionKey,
    questionText: () => questionText,
    residenceCountry: () => residenceCountry,
    resolveAgentAnswer: () => resolveAgentAnswer,
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
  var NL_PROVINCE = {
    "North Holland": ["amsterdam", "haarlem", "zaandam", "alkmaar", "hilversum", "amstelveen", "purmerend", "hoorn", "heerhugowaard", "haarlemmermeer", "schiphol", "diemen"],
    "South Holland": ["rotterdam", "the hague", "den haag", "s gravenhage", "leiden", "delft", "dordrecht", "zoetermeer", "gouda", "schiedam", "alphen aan den rijn", "wassenaar"],
    Utrecht: ["utrecht", "amersfoort", "zeist", "nieuwegein", "veenendaal", "houten"],
    "North Brabant": ["eindhoven", "tilburg", "breda", "s hertogenbosch", "den bosch", "helmond", "oss", "veldhoven", "roosendaal", "bergen op zoom"],
    Gelderland: ["nijmegen", "arnhem", "apeldoorn", "ede", "wageningen", "doetinchem", "zutphen"],
    Limburg: ["maastricht", "heerlen", "venlo", "sittard", "geleen", "roermond"],
    Groningen: ["groningen"],
    Overijssel: ["zwolle", "enschede", "deventer", "hengelo", "almelo"],
    Flevoland: ["almere", "lelystad"],
    Friesland: ["leeuwarden", "drachten", "heerenveen"],
    Drenthe: ["assen", "emmen", "hoogeveen"],
    Zeeland: ["middelburg", "vlissingen", "goes"]
  };
  function nlProvinceOf(city) {
    const key = questionKey(city);
    return Object.entries(NL_PROVINCE).find(([, places]) => places.includes(key))?.[0] ?? null;
  }
  var NL_NAME = /^(nl|nld|the netherlands|netherlands|nederland|holland)$/i;
  function residenceCountry(facts) {
    const kept = facts.answers?.country?.trim();
    if (kept)
      return kept;
    const parts = (facts.place ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (parts.length > 1 && last)
      return NL_NAME.test(last) ? "Netherlands" : last;
    const city = facts.answers?.city?.trim() || parts[0];
    return city && nlProvinceOf(city) ? "Netherlands" : null;
  }
  function residenceProvince(facts) {
    const country = residenceCountry(facts);
    if (country && !NL_NAME.test(country))
      return null;
    const city = facts.answers?.city?.trim() || (facts.place ?? "").split(",")[0]?.trim();
    return city ? nlProvinceOf(city) : null;
  }
  function privacyChoice(options) {
    const only = /\b(just|only|solely|merely)\b.*\b(this|the)\b.*\b(job|position|role|vacancy|opening|application)\b|\b(this|the) (job|position|role|vacancy|opening) only\b|\bonly for this\b|\bnot (for )?(any )?(other|future)\b/i;
    return options.findIndex((o) => only.test(o));
  }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function graduationParts(text) {
    const t = text.trim();
    const year = /\b(20\d{2})\b/.exec(t)?.[1] ?? null;
    const named = MONTHS.find((m) => new RegExp(`\\b${m.slice(0, 3)}`, "i").test(t));
    const numeric = /\b(0?[1-9]|1[0-2])\s*[/.-]\s*20\d{2}\b/.exec(t)?.[1];
    return { month: named ?? (numeric ? MONTHS[Number(numeric) - 1] : null), year };
  }
  function salaryFor(raw, key) {
    const text = (raw ?? "").trim();
    if (!text)
      return null;
    const amount = Number(digits(text));
    const monthly = /\b(month|monthly|maand|mo)\b|\/\s*m\b/i.test(text);
    const yearly = /\b(year|yearly|annual|annually|annum|jaar|yr)\b|\bp\.?a\.?\b/i.test(text);
    const wantsYear = /\b(annual|annually|per year|yearly|a year|jaarsalaris|per jaar|jaarlijks|total compensation|annuel|annuelle|par an|jahres\w*|jahrlich)\b/.test(key);
    const wantsMonth = /\b(monthly|per month|a month|per maand|maandsalaris|maandelijks|mensuel|mensuelle|par mois|monatlich)\b/.test(key);
    if (!Number.isFinite(amount) || amount <= 0)
      return text;
    const currency = /(€|eur\b|euro)/i.test(text) ? "EUR" : /(\$|usd)/i.test(text) ? "USD" : /(£|gbp)/i.test(text) ? "GBP" : "EUR";
    if (wantsYear && monthly && !yearly)
      return `${currency} ${amount * 12} a year`;
    if (wantsMonth && yearly && !monthly)
      return `${currency} ${Math.round(amount / 12)} a month`;
    return text;
  }
  var DECLINE = /^(decline|prefer not|i (do not|don'?t) wish|i'?d rather not|rather not|choose not|not (to )?(say|disclose|answer)|no answer|pr[eé]f[eè]re(r)? ne pas|je (pr[eé]f[eè]re|ne (souhaite|veux) pas))|\bdecline to (self[- ]identify|answer|state)\b|\bprefer not to (say|answer|disclose)\b|\bne (souhaite|veux) pas (r[eé]pondre|dire|divulguer)\b/i;
  var DEMOGRAPHIC = /\b(gender|genre|geslacht|geschlecht|race|ethnic\w*|veteran|pronouns?|how old are you|age (group|range|bracket)|lgbt\w*|sexual orientation|transgender|disabilit\w*|health condition|neurodiver\w*|under[- ]represented|caregiving|religio\w*|divulgation volontaire|identit\w* de genre|voluntary (self[- ]?identif|disclosure))\b/i;
  var TRAP_QUESTION = /leave (this|the|it)\b[^.?]{0,24}\b(empty|blank)|if you.?re (a )?human|(do not|don.?t) (fill|complete|enter)\b[^.?]{0,20}\b(this|here)|honey ?pot|bot ?trap|ignore this (field|input)|for (spam|bots) (only|detection)|(^|[\s_-])(hp|gotcha)([\s_-]|$)/i;
  function isTrapQuestion(label) {
    return TRAP_QUESTION.test((label || "").replace(/\s+/g, " ").trim());
  }
  function isConsentCheckbox(label) {
    const t = (label || "").replace(/\s+/g, " ").trim();
    if (!t)
      return false;
    if (DEMOGRAPHIC.test(t))
      return false;
    if (/^i (consent|agree)(\.|!)?$/i.test(t) || /^(akkoord|j'accepte|ich stimme zu|acepto)\.?$/i.test(t))
      return true;
    if (t.length < 8)
      return false;
    if (/\b(disabilit\w*|medical|health condition|criminal|conviction|background check)\b/i.test(t) && !/\bprivacy notice\b/i.test(t))
      return false;
    if (/\b(privacy notice|privacy policy|privacy statement|confidentialit\w*|avis de confidentialit|privacyverklaring|terms (and|&|of)|termes et conditions|voorwaarden|read and agree|agree to|j'?ai lu|you declare|i declare|i (have )?read|acknowledg|talent (pool|community)|future (career )?opportunities|whats?\s*app|keep me (informed|updated)|receive .{0,60}(messages|notifications|updates|communications)|certify that|information .{0,40}(true|accurate|correct)|informations? (sont )?(compl[eè]tes|exactes)|by submitting|processing my data|traitement de (mes|vos) donn|drug[- ]free|sans drogues|zonder drugs)\b/i.test(t))
      return true;
    return /\b(consent|toestemming|akkoord)\b/i.test(t) && /\b(job application|applications?|recruit|hiring|career|opportunit|privacy|terms|données|gegevens)\b/i.test(t);
  }
  function agentCanAnswer(label, facts, options) {
    if (isTrapQuestion(label))
      return true;
    return resolveAgentAnswer(label, facts, options) !== null;
  }
  function resolveAgentAnswer(label, facts, options) {
    if (isTrapQuestion(label))
      return "";
    const opts = options ?? [];
    const text = answerText(label, facts);
    if (text !== null) {
      if (opts.length) {
        let i = chooseOption([...opts], text, label);
        if (i < 0 && isHearQuestion(label))
          i = heardChoice(opts, text);
        if (i >= 0)
          return opts[i] ?? null;
      }
      return text;
    }
    if (opts.length) {
      const decline = demographicChoice(label, opts, facts);
      if (decline >= 0)
        return opts[decline] ?? null;
      const only = privacyChoice(opts);
      if (only >= 0)
        return opts[only] ?? null;
      const pick = preferenceChoice(label, opts);
      if (pick >= 0)
        return opts[pick] ?? null;
    }
    if (DEMOGRAPHIC.test(label) && !/^i answer/i.test((facts.answers?.demographics ?? "").trim())) {
      if (!opts.length)
        return "Prefer not to answer";
      const decline = opts.findIndex((o) => DECLINE.test(o.trim()));
      if (decline >= 0)
        return opts[decline] ?? null;
    }
    return null;
  }
  function preferenceChoice(label, options) {
    const key = questionKey(label);
    if (!/\b(prefer|preferred|favou?rite|if you had to choose|which of the following)\b/.test(key))
      return -1;
    if (/\b(visa|sponsor\w*|authori[sz]\w*|permit|disabilit\w*|gender|race|ethnic\w*|veteran|religio\w*|salary|compensation|relocat\w*|certif\w*|agree|consent)\b/.test(key))
      return -1;
    return options.findIndex((o) => o.trim() !== "" && !/^(select|choose|selecteer|make a selection|pick|— )/i.test(o.trim()) && !/^[—–-]/.test(o.trim()));
  }
  function demographicChoice(label, options, facts) {
    if (/^i answer/i.test((facts.answers?.demographics ?? "").trim()) || !DEMOGRAPHIC.test(label))
      return -1;
    return options.findIndex((o) => DECLINE.test(o.trim()));
  }
  var DIAL = /^\+(351|353|420|421|234|31|32|33|34|39|44|49|1|36|48|45|46|47|41|43|30|90|91|84|86|62|60|63|65|66|55|52|27|20|7)/;
  function dialCodeOf(phone) {
    const m = DIAL.exec((phone ?? "").replace(/[^\d+]/g, ""));
    return m ? `+${m[1]}` : null;
  }
  function isHearQuestion(label) {
    return /\b(how did you (hear|find|learn)|where did you (hear|find|see|learn)|how you (heard|found)|where (did|do) you find this (job|role|vacancy|opening|position)|source of (your )?application|from where did you hear|ou avez vous (trouve|entendu|appris)|comment avez vous (trouve|connu|entendu))\b/.test(questionKey(label));
  }
  function heardChoice(options, source) {
    for (const want of [source ?? "", "LinkedIn", "Job board", "Online job board", "Job site", "Job portal", "Careers website", "Company website", "Website", "Internet", "Social media", "Other"]) {
      if (!want)
        continue;
      const i = chooseOption([...options], want, "How did you hear");
      if (i >= 0)
        return i;
    }
    return -1;
  }
  function answerText(label, facts) {
    const key = questionKey(label);
    const a = facts.answers ?? {};
    const remembered = facts.remembered?.[applicationQuestionKey(label, facts.job_id)];
    const pick = (v) => v && v.trim() ? v.trim() : remembered || null;
    if (/\b(value|values|priorities)\b/.test(key) && /\b(role|job|workplace|new position)\b/.test(key) && !/salary|pay|compensation/.test(key))
      return pick(a.role_values);
    const asks = /^(have you|has |do you|does |did you|are you|is |can you|could you|would you|will you|were you|was |if you)/.test(key);
    if (/^(si oui|wenn ja|if yes)\b/.test(key) || /^if\b.*\b(not listed|another|other|not applicable|not already|you are not|you do not|you don t|specify|provide details|explain)\b/.test(key) && !/\bgraduation\b/.test(key))
      return null;
    if (/\b(first name|given name|voornaam|prenom|vorname)\b/.test(key))
      return pick(a.first_name);
    if (/\b(last name|surname|family name|achternaam|nom de famille|nachname)\b/.test(key))
      return pick(a.last_name);
    if (/^(full )?name$/.test(key))
      return a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : pick(facts.name);
    if (/\b(e ?mail\w*|courriel)\b/.test(key))
      return pick(a.email) ?? pick(facts.email);
    if (/\b(country|phone|calling|dial|area)\b.*\bcode\b|\bcode du pays\b|\blandcode\b|\bphone prefix\b|\btelefoonvoorvoegsel\b|\bindicatif\b/.test(key)) {
      const code = dialCodeOf(a.phone ?? facts.phone);
      const country = residenceCountry(facts);
      return pick(code ?? (country && NL_NAME.test(country) ? "+31" : null));
    }
    if (/\b(mobile|phone|telephone|telefon\w*|telefoon\w*|mobiel\w*|portable)\b/.test(key) && !/country|landcode|pays/.test(key))
      return pick(a.phone) ?? pick(facts.phone);
    if (/\blinkedin\b/.test(key) && !asks && !isHearQuestion(label))
      return pick(a.linkedin) ?? pick(facts.linkedin);
    if (asks && /\b(based|living|located|residing|reside|live|resident)\b/.test(key) && /\b(netherlands|nederland|holland|amsterdam|rotterdam|utrecht|the hague|den haag|eindhoven|delft|leiden|groningen|breda|tilburg|nijmegen|maastricht|haarlem|almere)\b/.test(key) && !/relocat|willing|open to|office|days?\b|able|travel/.test(key)) {
      const country = residenceCountry(facts);
      return country ? NL_NAME.test(country) ? "Yes" : "No" : remembered || null;
    }
    if (/\b(hybrid|office|on site|onsite|in person)\b/.test(key) && /\b(days?|week|comfortable|open to|willing|able|confirm|expect|require)\b/.test(key))
      return pick(a.onsite_ok);
    if (!asks && /\b(website|portfolio|github|personal site)\b/.test(key))
      return pick(a.website);
    if (!asks && /\b(city|ville|stadt|location|where do you live|woonplaats)\b/.test(key) && !/relocat/.test(key))
      return pick(a.city) ?? pick(facts.place?.split(",")[0]);
    if (/\b(postal code|postcode|zip code|zip)\b/.test(key))
      return pick(a.postcode);
    if (/^(street address|address|address line 1|adres|straat)/.test(key))
      return pick(a.address);
    if (/^(country|country of residence|land|pays|pays de residence)$/.test(key) || /\b(country|land)\b.*\b(reside|resides|residing|residence|live|living|located)\b|\b(reside|resides|residing|residence|live|living)\b.*\b(country|land)\b/.test(key))
      return pick(residenceCountry(facts));
    if (/^(state|province|state province|province state|state or province|provincie|region|state region|province region|etat|etat province|bundesland)$/.test(key))
      return pick(residenceProvince(facts));
    if (remembered)
      return remembered;
    if (/\b(internship|stage|placement|work placement)\b.*\b(agreement|contract|overeenkomst)\b|\bstage ?overeenkomst|\b(agreement|overeenkomst)\b.*\b(university|school|college)\b/.test(key))
      return pick(a.internship_agreement);
    if (/^study (start|end) date( month| year)?$/.test(key)) {
      const part = graduationParts(/^study start/.test(key) ? a.study_start ?? "" : a.graduation_date ?? "");
      if (/month$/.test(key))
        return pick(part.month);
      if (/year$/.test(key))
        return pick(part.year);
      return pick(/^study start/.test(key) ? a.study_start : a.graduation_date);
    }
    if (/\b(current|most recent|latest|last)\b.*\b(job title|position title|role title|title|position|role)\b/.test(key) && !asks)
      return pick(a.current_job_title);
    if (/\b(current|most recent|latest|last)\b.*\b(company|employer|organi[sz]ation)\b/.test(key) && !asks)
      return pick(a.current_company);
    if (/\b(graduat\w*|afstudeer\w*)\b/.test(key)) {
      if (/\b(did you graduate|have you graduated|you graduated|graduated from)\b/.test(key))
        return null;
      const date = a.graduation_date ?? "";
      const part = graduationParts(date);
      if (/\bmonth\b/.test(key))
        return pick(part.month);
      if (/\byear\b/.test(key))
        return pick(part.year);
      return pick(date);
    }
    if (/\b(current|which|what)\b.*\byear\b.*\b(studies|study|degree|programme|program|education)\b|\byear of (your )?(studies|study|degree|programme|program)\b|\b(jaar van je studie|studiejaar)\b/.test(key))
      return pick(a.study_year);
    if (isHearQuestion(label))
      return pick(facts.job_source);
    if (/\b(previously|before|already|earlier)\b.*\bappl(ied|y|ication)\b|\bappl(ied|ication)\b.*\b(before|previously|this season|earlier)\b/.test(key))
      return facts.applied_before === true ? "Yes" : facts.applied_before === false ? remembered || "No" : remembered || null;
    if (/\b(are you|currently|presently)\b.*\b(student|enrolled|studying)\b|\b(enrolled|enrolment|enrollment|ingeschreven)\b/.test(key))
      return pick(a.study_status);
    if (/\b(compulsor\w*|mandatory|required)\b.*\b(internship|stage|placement|part of (your )?(studies|program|programme|academic))\b|\b(internship|stage|placement)\b.*\b(compulsor\w*|mandatory|required part|part of (your )?(studies|program|programme|academic))\b/.test(key))
      return pick(a.internship_agreement);
    if (/\b(degree|diploma|level of education|education level|highest level|opleidingsniveau)\b/.test(key) && !/\b(enrolled|enrolment|enrollment|internship|duration|compulsory|mandatory)\b/.test(key))
      return pick(a.degree);
    if (/\b(18|eighteen)\b.*\b(ans|years|jaar|older|plus|ouder|alt)\b|\b(at least|over|above)\b.*\b18\b/.test(key))
      return facts.adult ? "Yes" : remembered || null;
    if (/\b(current|currently|actuellement|momenteel|derzeit)\b.*\b(employee|employe\w*|employed|in dienst|beschaftigt)\b/.test(key) && !/\b(family|spouse|parent|sibling|relative|famille|membre|familie)\b/.test(key))
      return facts.never_worked_here ? "No" : remembered || null;
    if (/\b(family|relative|spouse|parent|sibling|membre de votre famille|famille)\b.*\b(employ\w*|work\w*|travaill\w*)\b/.test(key))
      return /^no\b/i.test(a.insider ?? "") ? "No" : remembered || null;
    if (/\b(non ?compet\w*|non ?concurrence|noncompete|restrictive covenant)\b|\b(patent|patents|brevets?|confidential\w*|proprietary|exclusive information)\b.*\b(agreement|entente|contract|accord|signed|sign)\b|\b(agreement|entente|signed|sign)\b.*\b(patent|patents|brevets?|confidential\w*|proprietary)\b/.test(key))
      return /^no\b/i.test(a.prior_agreements ?? "") ? "No" : remembered || null;
    if (/\b(field of study|major|study programme|study program|discipline|area of study|opleiding|studierichting)\b/.test(key))
      return pick(a.field_of_study);
    if (/\b(university|universiteit|school|college|institution|hogeschool|school name)\b/.test(key) && key.split(" ").length <= 6 && !/\b(high school|year|date|reference|referral|hear|find|about|why)\b/.test(key))
      return pick(a.university);
    if (/\b(nationality|nationaliteit|citizenship)\b/.test(key) && key.length <= 90)
      return pick(a.nationality);
    if (/\b(gender|geslacht|geschlecht|genre|sex)\b/.test(key) && !/\b(identity|transgender|pronouns?|orientation|identit)\b/.test(key) && key.length <= 90 && a.gender?.trim())
      return a.gender.trim();
    if (/\b(eu|eea)\b.*\b(passport|citizen|national|permit)|\b(passport|residence permit|student (visa|permit|residence))\b/.test(key) && !/\b(sponsor|parrainage)\b/.test(key)) {
      const w = a.work_authorization ?? "";
      if (!w)
        return remembered || null;
      if (/^\s*yes\b|\b(eu|eea)\b|\bcitizen\b|\bnational\b|\bpassport\b|\bpermit\b|\bzoekjaar\b|\borientation year\b|\bsearch year\b|\bfree to work\b|\bauthori[sz]ed\b/i.test(w))
        return "Yes";
      if (/^\s*no\b|\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w))
        return "No";
      return pick(w);
    }
    if (/\b(based|where do you live|where are you)\b/.test(key) && /\brelocat/.test(key)) {
      const place = pick(a.city) ?? pick(facts.place?.split(",")[0]?.trim());
      const reloc = pick(a.relocation);
      if (place && reloc)
        return `${place}. ${reloc}`;
      return place || reloc || remembered || null;
    }
    if (/\b(relocat\w*)\b/.test(key))
      return pick(a.relocation);
    if (/\bnotice period\b|\bopzegtermijn\b/.test(key) && /\b(start|available|availability|when (can|would) you|able to start|beschikbaar)\b/.test(key)) {
      const start = pick(a.start_date);
      const notice = pick(a.notice_period);
      if (start && notice)
        return `${start}. Notice period: ${notice}`;
      return start || notice || remembered || null;
    }
    if (/\bnotice period\b|\bopzegtermijn\b/.test(key))
      return pick(a.notice_period);
    if (/\b(start date|when can you start|when would you (be able to )?start|available to start|able to start|availability|earliest start|beschikbaar)\b/.test(key))
      return pick(a.start_date);
    if (!asks && /\bhours\b.*\bweek\b|\bper week\b|\buren\b/.test(key))
      return pick(a.hours_per_week);
    if (/\b(salary|compensation|pay|wage|salaris|salaire|gehalt|stipend)\b/.test(key))
      return pick(salaryFor(a.expected_salary, key));
    if (/\b(sponsor\w*|visa|parrainage)\b/.test(key)) {
      if (/\b(details|explain|describe|elaborate|please provide|why)\b/.test(key))
        return null;
      if (facts.job_country && facts.job_country !== "NL")
        return null;
      if (/\b(orientation year|search year|zoekjaar|highly skilled|kennismigrant|blue card)\b/.test(key))
        return null;
      const w = a.work_authorization ?? "";
      if (!w)
        return null;
      if (/\bwithout\b.*\b(sponsor|visa|parrainage)|\b(no|not)\b.*\b(sponsor|visa|parrainage)\w*\b.*\b(needed|required)|\b(valid|current|existing)\b.*\b(visa|work permit|permit)\b/.test(key)) {
        if (/\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w) || /\bno(t)?\b.*\b(allowed|authori[sz]ed|permit)\b/i.test(w))
          return "No";
        if (/^\s*yes\b|\b(eu|eea) (citizen|national)|\bfree to work|\ballowed to work|\bauthori[sz]ed\b|\bpermit\b|\b(zoekjaar|orientation year|search year)\b/i.test(w))
          return "Yes";
        return null;
      }
      if (/\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w) || /\bno(t)?\b.*\b(allowed|authori[sz]ed|permit)\b/i.test(w))
        return "Yes";
      if (/^\s*yes\b|\b(eu|eea) (citizen|national)|\bfree to work|\bno (sponsor|visa)\w* (needed|required)|\ballowed to work|\bauthori[sz]ed\b|\bpermit\b|\b(zoekjaar|orientation year|search year)\b/i.test(w))
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
      return /^\s*yes\b|\b(eu|eea)\b|\ballowed\b|\bauthori[sz]ed\b|\bfree to work\b|\bpermit\b|\b(zoekjaar|orientation year|search year)\b/i.test(w) ? "Yes" : null;
    }
    if (asks && /\bnative\b/.test(key) && /\b(dutch|nederlands)\b/.test(key)) {
      const level = (facts.dutch ?? "").toLowerCase();
      return level ? level === "native" ? "Yes" : "No" : remembered || null;
    }
    if (/\bdutch\b|\bnederlands\b/.test(key) && /\b(level|proficiency|speak|fluent|niveau)\b/.test(key)) {
      if (asks) {
        const level = (facts.dutch ?? "").toLowerCase();
        if (!level)
          return remembered || null;
        const good = level === "professional" || level === "native";
        if (/\benglish\b/.test(key))
          return good ? remembered || null : "No";
        return good ? "Yes" : "No";
      }
      return pick(facts.dutch);
    }
    return null;
  }
  var norm = (t) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+]+/g, " ").trim();
  function chooseOption(options, answer, label = "") {
    const canon = (t) => norm(t).replace(/\bnoord\b/g, "north").replace(/\bzuid\b/g, "south").replace(/\bfryslan\b/g, "friesland").replace(/\bnederland\b/g, "netherlands").replace(/^the netherlands$/, "netherlands").replace(/^pays bas$|^niederlande$/, "netherlands").replace(/^hollande septentrionale$|^nordholland$/, "north holland").replace(/^hollande meridionale$|^sudholland$/, "south holland").replace(/^brabant septentrional$|^nordbrabant$/, "north brabant").replace(/^frise$/, "friesland").replace(/^zelande$/, "zeeland").replace(/^geldre$/, "gelderland").replace(/^(man|male|mannelijk|homme|mannlich|masculin\w*)\b/, "male").replace(/^(woman|female|vrouw|vrouwelijk|femme|weiblich|feminin\w*)\b/, "female");
    const want = canon(answer);
    const opts = options.map(canon);
    if (/\bdegree\b|\bdiploma\b|\beducation\b/.test(norm(label))) {
      const level = (t) => /\b(phd|doctor\w*)\b/.test(t) ? "phd" : /\b(master\w*|msc|mba|ma|llm)\b/.test(t) ? "master" : /\b(bachelor\w*|bsc|ba|llb)\b/.test(t) ? "bachelor" : /\b(associate|diploma|certificate)\b/.test(t) ? "associate" : null;
      const wanted = level(want);
      const i = wanted ? opts.findIndex((o, n) => options[n] !== undefined && level(o) === wanted) : -1;
      if (i >= 0)
        return i;
    }
    const real = (i) => !/^(select an option|select|selecteer|choose|kies|kiezen|make a selection|pick one)\b/.test(opts[i]) && opts[i] !== "";
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
    const nth = /\b([1-6])(st|nd|rd|th)?\b/.exec(want)?.[1];
    if (nth && /\byear\b|\bjaar\b/.test(`${want} ${norm(label)}`)) {
      const ordinal = ["", "first", "second", "third", "fourth", "fifth", "sixth"][Number(nth)];
      const i = opts.findIndex((o, n) => real(n) && (new RegExp(`\\b${nth}(st|nd|rd|th)?\\b`).test(o) || o.includes(ordinal)) && /\byear\b|\bjaar\b/.test(o));
      if (i >= 0)
        return i;
    }
    const yes = /^(yes|ja|true|y|oui|si)\b/.test(want);
    const no = /^(no|nee|false|n|non|nein)\b/.test(want);
    if (yes || no)
      return opts.findIndex((o, n) => real(n) && (yes ? /^(yes|ja|oui|si)\b/ : /^(no|nee|non|nein)\b/).test(o));
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

  // supabase/functions/_shared/apply-censor.ts
  var exports_apply_censor = {};
  __export(exports_apply_censor, {
    chipAllowed: () => chipAllowed,
    classifyCensorFlags: () => classifyCensorFlags,
    detectWidgetKind: () => detectWidgetKind,
    forbiddenGapChip: () => forbiddenGapChip,
    formActuallyFilled: () => formActuallyFilled,
    hasFillFailed: () => hasFillFailed,
    isContactLabel: () => isContactLabel,
    nextApplyStage: () => nextApplyStage
  });
  function detectWidgetKind(el) {
    if (el.kind === "file")
      return "file";
    if (el.kind === "choice")
      return "choice";
    if (el.kind === "listbox")
      return "listbox";
    if (el.kind === "combobox")
      return "typeahead";
    const id = el.id || "";
    const cls = el.className || "";
    const role = el.role || "";
    const auto = el.ariaAutocomplete || "";
    if (id === "location-input" || /\blocation-input\b/.test(cls) || role === "combobox" || auto === "list")
      return "typeahead";
    if (el.inCustomQuestion)
      return "card";
    return "plain";
  }
  var CONTACT = /\b(first name|given name|voornaam|last name|family name|surname|achternaam|full name|e-?mail|courriel|phone|telephone|telefoon|mobile|mobiel)\b/i;
  function isContactLabel(label) {
    return CONTACT.test((label || "").replace(/\s+/g, " ").trim());
  }
  function formActuallyFilled(fields) {
    for (const f of fields) {
      if (f.kind === "checkbox")
        continue;
      if (f.kind === "file") {
        if (f.required && !f.answered)
          return false;
        continue;
      }
      if ((f.required || isContactLabel(f.label)) && !f.answered)
        return false;
    }
    return true;
  }
  function hasFillFailed(fields) {
    return fields.some((f) => f.fillFailed && !f.answered);
  }
  function classifyCensorFlags(input) {
    const flags = [];
    if (input.listingGone)
      flags.push("listing_gone");
    if (input.captcha)
      flags.push("captcha");
    if (input.account)
      flags.push("account_gate");
    if (input.stuckLoop)
      flags.push("stuck_loop");
    if (!input.hasForm && !input.hasApplyCta)
      flags.push("wrong_page", "no_apply_cta");
    else if (!input.hasForm)
      flags.push("no_apply_cta");
    if (input.hasForm && !input.hasNext && !input.onReview)
      flags.push("no_next");
    if (input.fields.some((f) => f.kind !== "checkbox" && f.required && !f.answered))
      flags.push("empty_required");
    if (hasFillFailed(input.fields))
      flags.push("fill_failed");
    return [...new Set(flags)];
  }
  function chipAllowed(opts) {
    if (opts.state === "done" && (!opts.formFilled || opts.stillEmptyGaps))
      return false;
    if (/Checking that the website kept/i.test(opts.message) && opts.stillEmptyGaps)
      return false;
    if (/Filled in by odds/i.test(opts.message) && (!opts.formFilled || opts.stillEmptyGaps))
      return false;
    return true;
  }
  function nextApplyStage(opts) {
    if (opts.captcha || opts.account)
      return "human";
    if (opts.formFilled && !opts.stillEmptyGaps)
      return "ready";
    if (!opts.stillEmptyGaps)
      return "filling";
    if (!opts.agentAnswersTried)
      return "agent_answers";
    if (!opts.agentScanTried)
      return "agent_scan";
    return "human";
  }
  function forbiddenGapChip(message, stillEmptyGaps) {
    if (!stillEmptyGaps)
      return false;
    return /Checking that the website kept|Filled in by odds/i.test(message);
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
  globalThis.oddsApply = { ...exports_apply_form, ...exports_apply_censor };
})();
