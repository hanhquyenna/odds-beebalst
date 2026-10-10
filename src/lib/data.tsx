import { mergePool } from "@/lib/sources"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { readCache, writeCache } from "@/lib/cache"
import { keepSessionFresh, keepStorage, restoreSession, signOut as authSignOut, startGuestSession, type Session } from "@/lib/auth"
import { computeShares, type CategoryShare } from "@/lib/engine"
import { collectedOn } from "@/lib/format"
import { todayIso } from "@/lib/tracker"
import type { Strength } from "@/lib/strength"
import { migrateProfile } from "@/lib/people-migrate"
import { keepPast, readPast } from "@/lib/suggest"
import { useProfileFacts } from "@/lib/use-profile-facts"
import {
  deleteApplication,
  fetchApplications,
  fetchPostings,
  fetchKeptPostings,
  fetchStoredLogos,
  signalsOf,
  fetchReference,
  insertApplication,
  loadProfile,
  refreshAges,
  saveProfile,
  updateStage,
  type Reference,
  type Signals,
} from "@/lib/jobs"
import { logoFor } from "@/lib/companies"
import { mergeSaved, pushSaved } from "@/lib/saved-sync"
import { loadAutoLogos, registerLogos, useAutoLogosReady } from "@/lib/stored-logos"
import { DEFAULT_PROFILE, type Application, type PastSearch, type Person, type Posting, type Profile } from "@/lib/types"

const PROFILE_KEY = "careersim.profile"
const SAVED_KEY = "careersim.saved"
const LOCAL_POSTS_KEY = "careersim.posts"
/** Where the signals were kept before they moved to the IndexedDB cache; cleared once so it stops taking localStorage room. */
const LEGACY_SIGNALS_KEY = "careersim.signals"
const LOCAL_APPS_KEY = "careersim.apps"
const REFERRAL_KEY = "careersim.referrals"
const PASSED_KEY = "careersim.passed"
/** Cache keys (cache.ts) for the public reads a return visit paints from before the network answers. */
const POOL_CACHE = "pool"

/** The public reads a visit starts from, kept together so a return visit can paint them in one go. */
interface Pool {
  postings: Posting[]
  reference: Reference
  logos: Array<{ employer: string; logo: string }>
}

/** Reads a JSON value from localStorage, or the fallback when there is none or storage is blocked. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)

    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Writes a JSON value to localStorage; a full or blocked storage just skips it. */
function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

export interface Data {
  status: "loading" | "ready" | "error"
  /** True once the stored session (and any ?link= code) is restored. Cached jobs can be "ready" before it. */
  sessionChecked: boolean
  error: string | null
  postings: Posting[]
  /** How the work is done, from the posting text, by posting id. Comes with the postings. */
  signals: Record<string, Signals>
  byId: Map<string, Posting>
  /** Jobs you kept that are no longer in the open pool (closed since): read separately so they stay in your list, marked closed. */
  keptExtra: Posting[]
  shares: Record<Posting["cat"], CategoryShare> | null
  /** When the postings were collected, worked out from them. */
  collected: string
  reference: Reference | null
  profile: Profile
  profileSaved: boolean
  setProfile: (next: Profile) => void
  session: Session | null
  setSession: (session: Session | null) => void
  signOut: () => void
  saved: Set<string>
  toggleSaved: (id: string) => void
  passed: Set<string>
  setPassed: (id: string, on: boolean) => void
  setSaved: (id: string, on: boolean) => void
  /** Jobs where you have a referral: ticked by hand, or a person linked to the job as your referral. */
  referrals: Set<string>
  /** How strong your saved profile reads for this job (strength.ts), or null until something has been read: the chance then shows without it. */
  strengthFor: (post: Pick<Posting, "family">) => Strength | null
  toggleReferral: (id: string) => void
  people: Person[]
  addPerson: (person: Omit<Person, "id">) => Person
  updatePerson: (id: string, patch: Partial<Omit<Person, "id">>) => void
  removePerson: (id: string) => void
  /** Change what a job's people search has found so far (show more, drop one, add a page). Null removes it. */
  updatePast: (postingId: string, change: (current: PastSearch | null) => PastSearch | null) => void
  /** Loads the shared jobs again, for when one was just added. */
  refreshPostings: () => Promise<void>
  addLocalPosting: (post: Posting) => void
  addLocalPostings: (posts: Posting[]) => void
  removeLocalPosting: (id: string) => void
  applications: Application[]
  logApplication: (post: Posting, fit: string, stage?: Application["stage"]) => Promise<void>
  changeStage: (id: Application["id"], stage: Application["stage"]) => Promise<void>
  removeApplication: (id: Application["id"]) => Promise<void>
}

const Context = createContext<Data | null>(null)

export function useData(): Data {
  const value = useContext(Context)
  if (!value) {
    throw new Error("useData outside DataProvider")
  }

  return value
}

export function DataProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<Data["status"]>("loading")
  const [error, setError] = useState<string | null>(null)
  const [remote, setRemote] = useState<Posting[]>([])
  // Postings merged into another (the same job found on a second platform) point at the one kept, so older saved ids still resolve.
  const [alias, setAlias] = useState<Map<string, string>>(new Map())
  const [local, setLocal] = useState<Posting[]>(() => read<Posting[]>(LOCAL_POSTS_KEY, []))
  const [reference, setReference] = useState<Reference | null>(null)
  const [profile, setProfileState] = useState<Profile>(() => migrateProfile({ ...DEFAULT_PROFILE, ...read<Partial<Profile>>(PROFILE_KEY, {}) }))
  const [profileSaved, setProfileSaved] = useState<boolean>(false)
  const [session, setSessionState] = useState<Session | null>(null)
  // The jobs can paint from the cache before the stored session is restored; nothing that depends on being signed out runs until it is.
  const [sessionChecked, setSessionChecked] = useState<boolean>(false)
  const [saved, setSaved] = useState<Set<string>>(() => new Set(read<string[]>(SAVED_KEY, [])))
  const [passedLocal, setPassedState] = useState<Set<string>>(() => new Set(read<string[]>(PASSED_KEY, [])))
  const passed = useMemo(() => new Set([...passedLocal, ...(profile.dismissed ?? [])]), [passedLocal, profile.dismissed])
  const [manualReferrals, setReferrals] = useState<Set<string>>(() => new Set(read<string[]>(REFERRAL_KEY, [])))

  // Anything saved against a posting that was merged into another moves to the one kept.
  useEffect(() => {
    if (alias.size === 0) {
      return
    }
    const remap = (prev: Set<string>): Set<string> => {
      if (![...prev].some((id) => alias.has(id))) {
        return prev
      }

      return new Set([...prev].map((id) => alias.get(id) ?? id))
    }
    setSaved(remap)
    setPassedState(remap)
    setReferrals(remap)
  }, [alias])
  const [applications, setApplications] = useState<Application[]>(() => read<Application[]>(LOCAL_APPS_KEY, []))
  const people: Array<Person> = profile.people ?? []
  // A person linked to a job as your referral is the same fact as ticking it by hand, so the two are one set.
  const referrals = useMemo((): Set<string> => new Set([...manualReferrals, ...(profile.people ?? []).filter((p): boolean => p.status === "Referred" && Boolean(p.jobId)).map((p): string => p.jobId as string)]), [manualReferrals, profile.people])
  const timer = useRef<number | undefined>(undefined)
  const profileRef = useRef<Profile>(profile)
  profileRef.current = profile
  const facts = useProfileFacts(profile, session)
  const refreshFacts: () => void = facts.refresh
  // Signing in, or the saved profile arriving, reads it once; every later save reads again (see setProfile).
  useEffect(() => {
    if (session && profileSaved) {
      facts.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, profileSaved])

  // The session is restored on its own, so a slow token refresh never holds the jobs back.
  useEffect(() => {
    let live = true
    void restoreSession()
      .catch(() => null)
      .then((restored) => {
        if (live) {
          setSessionState(restored)
          setSessionChecked(true)
        }
        // Signed in: ask the browser to keep this site's data, so the sign-in lasts.
        if (restored) keepStorage()
      })

    return () => {
      live = false
    }
  }, [])

  // The pool and the reference tables are public, so they load before anyone signs in. A return visit paints the copy kept last time
  // at once and swaps the fresh one in when it lands; the first visit waits for the network as before.
  useEffect(() => {
    let live = true
    let fresh = false
    let shown = false
    const show = (pool: Pool): void => {
      shown = true
      registerLogos(pool.logos)
      const merged = mergePool(pool.postings)
      setRemote(merged.jobs)
      setAlias(merged.alias)
      setReference(pool.reference)
      setStatus("ready")
    }
    try {
      localStorage.removeItem(LEGACY_SIGNALS_KEY)
    } catch {
      // Blocked storage: nothing to clear.
    }
    void readCache<Pool>(POOL_CACHE).then((cached) => {
      if (live && !fresh && cached) {
        refreshAges(cached.data.postings)
        show(cached.data)
      }
    })
    Promise.all([fetchPostings(), fetchReference(), fetchStoredLogos()])
      .then(([postings, ref, logos]) => {
        if (!live) {
          return
        }
        fresh = true
        const pool: Pool = { postings: postings, reference: ref, logos: logos }
        show(pool)
        void writeCache(POOL_CACHE, stampOf(postings), pool)
      })
      .catch((e: unknown) => {
        if (!live) {
          return
        }
        if (shown) {
          toast.error("Could not refresh the jobs. Showing the ones from your last visit.", { id: "pool-refresh" })

          return
        }
        setError(e instanceof Error ? e.message : "Could not load the jobs")
        setStatus("error")
      })

    return () => {
      live = false
    }
  }, [])

  // What each posting's text says about the work (hybrid, part-time...), worked out once per posting by the database.
  const signals = useMemo(() => signalsOf(remote), [remote])

  // A job whose employer has no logo anywhere (our lists, the employer's own site, the job link) is left out: it shows as a bare circle of letters and is nearly always a thin, unverifiable listing.
  // Jobs you saved or applied to are fetched on their own below, so they stay in your list. Until the later logo lists have loaded, nothing is hidden.
  const logosReady = useAutoLogosReady()
  useEffect(() => loadAutoLogos(), [])
  // odds is for international students: a job that asks for Dutch is never in any list, whatever the filters say. (A job you saved before stays, fetched on its own below.)
  const withLogo = useMemo(() => remote.filter((p) => !p.dutch_required && (!logosReady || logoFor(p.employer, p.url) !== null)), [remote, logosReady])
  const postings = useMemo(() => [...local, ...withLogo], [local, withLogo])
  // A job you saved or applied to can leave the open pool (it closed). It is fetched on its own, once, so it stays in your list.
  const [keptExtra, setKeptExtra] = useState<Posting[]>([])
  const askedFor = useRef<Set<string>>(new Set())
  const byId = useMemo(() => {
    const map = new Map(postings.map((p) => [p.id, p]))
    for (const p of keptExtra) {
      if (!map.has(p.id)) map.set(p.id, p)
    }
    for (const [from, to] of alias) {
      const kept = map.get(to)
      if (kept && !map.has(from)) {
        map.set(from, kept)
      }
    }

    return map
  }, [postings, alias, keptExtra])
  useEffect(() => {
    if (status !== "ready") {
      return
    }
    const wanted = [...saved, ...applications.map((a) => a.posting_id)].filter((id) => !id.startsWith("local-") && !byId.has(id) && !alias.has(id) && !askedFor.current.has(id))
    if (wanted.length === 0) {
      return
    }
    for (const id of wanted) askedFor.current.add(id)
    fetchKeptPostings([...new Set(wanted)])
      .then((found) => setKeptExtra((now) => [...now, ...found.filter((p) => !now.some((n) => n.id === p.id))]))
      .catch(() => undefined)
  }, [status, saved, applications, byId, alias])
  const shares = useMemo(() => (remote.length ? computeShares(remote) : null), [remote])
  const collected = useMemo(() => collectedOn(remote), [remote])

  // Imported LinkedIn without an account: a guest account is made at once, so the profile is kept and the phone and the
  // morning message work. The profile on this device is then saved to it (below, "first time this account is used").
  const guestAsked = useRef<boolean>(false)
  useEffect(() => {
    if (session || !sessionChecked || status !== "ready" || !profile.linkedin || guestAsked.current) {
      return
    }
    guestAsked.current = true
    startGuestSession()
      .then((guest) => guest && setSessionState(guest))
      .catch(() => undefined)
  }, [session, sessionChecked, status, profile.linkedin])

  // Tokens last an hour: without this, a tab left open keeps "saving" into 401s and the next load drops those edits.
  const signedIn = session !== null
  useEffect(() => (signedIn ? keepSessionFresh(setSessionState) : undefined), [signedIn])

  // Signing in brings the stored profile and applications down; they win over this browser's copy.
  useEffect(() => {
    if (!session || status !== "ready") {
      return
    }
    let live = true
    loadProfile(session.user.id)
      .then((stored) => {
        if (!live) {
          return
        }
        if (stored) {
          setProfileState(migrateProfile({ ...DEFAULT_PROFILE, ...stored }))
          setProfileSaved(true)
        } else {
          // First time this account is used: the database gets a row either way, so signing in always
          // leaves the account behind it up to date. With answers on this device they ride along, otherwise
          // the blank profile does: a later save fills it in.
          saveProfile(session.user.id, profileRef.current)
            .then(() => setProfileSaved(true))
            .catch(() => undefined)
        }
      })
      .catch(() => undefined)
    // Applications logged before sign-in move to the account, so the pipeline survives the session.
    // Anything already there, or failing to move, stays where it is.
    fetchApplications(byId)
      .then(async (rows) => {
        if (!live) {
          return
        }
        const queued = read<Application[]>(LOCAL_APPS_KEY, []).filter((a) => String(a.id).startsWith("local-"))
        const missing = queued.filter((q) => !rows.some((r) => r.posting_id === q.posting_id))
        const moved: Application[] = []
        for (const app of missing) {
          try {
            await insertApplication(session.user.id, app.posting_id, app.fit_tier)
            moved.push(app)
          } catch {
            continue
          }
        }
        if (!live) {
          return
        }
        if (moved.length === 0) {
          setApplications(rows)

          return
        }
        const fresh = await fetchApplications(byId)
        if (!live) {
          return
        }
        for (const app of moved) {
          const mine = fresh.find((r) => r.posting_id === app.posting_id)
          if (mine && app.stage !== "applied") {
            await updateStage(mine.id, app.stage).catch(() => undefined)
            mine.stage = app.stage
          }
        }
        const landed = new Set(moved.filter((m) => fresh.some((r) => r.posting_id === m.posting_id)).map((m) => m.id))
        write(
          LOCAL_APPS_KEY,
          read<Application[]>(LOCAL_APPS_KEY, []).filter((a) => !landed.has(a.id)),
        )
        setApplications(fresh)
      })
      .catch(() => undefined)

    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, status])

  const setProfile = useCallback(
    (next: Profile): void => {
      setProfileState(next)
      write(PROFILE_KEY, next)
      if (!session) {
        return
      }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        saveProfile(session.user.id, next)
          .then(() => {
            setProfileSaved(true)
            // The saved profile is what gets read, so read it once it is saved.
            refreshFacts()
          })
          .catch(() => {
            // The change stays on this device and rides along with the next save.
            setProfileSaved(false)
            toast.error("Could not save to your account. Your changes are kept on this device.", { id: "profile-save" })
          })
      }, 800)
    },
    [session, refreshFacts],
  )

  const signedInId = session?.user.id ?? null
  const toggleSaved = useCallback((id: string): void => {
    setSaved((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) {
        next.add(id)
      }
      write(SAVED_KEY, [...next])
      if (signedInId) pushSaved(id, next.has(id))

      return next
    })
  }, [signedInId])

  const setSaved_ = useCallback((id: string, on: boolean): void => {
    setSaved((prev) => {
      const next = new Set(prev)
      if (on) {
        next.add(id)
      } else {
        next.delete(id)
      }
      write(SAVED_KEY, [...next])
      if (signedInId) pushSaved(id, on)

      return next
    })
  }, [signedInId])

  // Signing in brings the account's saved jobs down and copies this browser's up, once per account.
  const savedMerged = useRef<string | null>(null)
  useEffect(() => {
    if (!signedInId || savedMerged.current === signedInId) return
    savedMerged.current = signedInId
    void mergeSaved(saved).then((all) => {
      if (!all) return
      write(SAVED_KEY, [...all])
      setSaved(all)
    })
    // Once per sign-in: the list at that moment is what gets merged; later changes are pushed one by one above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInId])

  const setPassed = useCallback((id: string, on: boolean): void => {
    // A job you pass on is also kept with the profile, so it stays passed on any device and is never recommended again.
    const dismissed = new Set(profileRef.current.dismissed ?? [])
    if (on ? !dismissed.has(id) : dismissed.delete(id)) {
      if (on) dismissed.add(id)
      setProfile({ ...profileRef.current, dismissed: [...dismissed] })
    }
    setPassedState((prev) => {
      const next = new Set(prev)
      if (on) {
        next.add(id)
      } else {
        next.delete(id)
      }
      write(PASSED_KEY, [...next])

      return next
    })
  }, [setProfile])

  const toggleReferral = useCallback((id: string): void => {
    setReferrals((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) {
        next.add(id)
      }
      write(REFERRAL_KEY, [...next])

      return next
    })
  }, [])

  const addPerson = useCallback(
    (person: Omit<Person, "id">): Person => {
      const made: Person = { ...person, id: crypto.randomUUID() }
      setProfile({ ...profileRef.current, people: [...(profileRef.current.people ?? []), made] })

      return made
    },
    [setProfile],
  )

  const updatePerson = useCallback(
    (id: string, patch: Partial<Omit<Person, "id">>): void => {
      setProfile({ ...profileRef.current, people: (profileRef.current.people ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) })
    },
    [setProfile],
  )

  const updatePast = useCallback(
    (postingId: string, change: (current: PastSearch | null) => PastSearch | null): void => {
      const current = readPast(profileRef.current.peopleFound?.[postingId])
      setProfile({ ...profileRef.current, peopleFound: keepPast(profileRef.current.peopleFound, postingId, change(current)) })
    },
    [setProfile],
  )

  const removePerson = useCallback(
    (id: string): void => {
      setProfile({ ...profileRef.current, people: (profileRef.current.people ?? []).filter((p) => p.id !== id) })
    },
    [setProfile],
  )

  const addLocalPosting = useCallback((post: Posting): void => {
    setLocal((prev) => {
      const next = [post, ...prev]
      write(LOCAL_POSTS_KEY, next)

      return next
    })
  }, [])

  const addLocalPostings = useCallback((posts: Posting[]): void => {
    setLocal((prev) => {
      const next = [...posts, ...prev]
      write(LOCAL_POSTS_KEY, next)

      return next
    })
  }, [])

  const removeLocalPosting = useCallback((id: string): void => {
    setLocal((prev) => {
      const next = prev.filter((p) => p.id !== id)
      write(LOCAL_POSTS_KEY, next)

      return next
    })
  }, [])

  // Applications change on screen at once; the server is told after, and a failure puts the list back with a toast.
  const appsRef = useRef<Application[]>(applications)
  appsRef.current = applications
  const changeApps = useCallback((change: (prev: Application[]) => Application[]): void => {
    setApplications((prev) => {
      const next = change(prev)
      write(LOCAL_APPS_KEY, next.filter((a) => String(a.id).startsWith("local-")))

      return next
    })
  }, [])

  const logApplication = useCallback(
    async (post: Posting, fit: string, stage: Application["stage"] = "applied"): Promise<void> => {
      const online = session !== null && !post.local
      // Signed in, the row shows under a placeholder id until the server's row replaces it; it is never kept as a local one.
      const entry: Application = {
        id: online ? `pending-${Date.now()}` : `local-${Date.now()}`,
        posting_id: post.id,
        title: post.title,
        employer: post.employer_display,
        fit_tier: fit,
        stage: stage,
        logged_at: todayIso(),
      }
      changeApps((prev) => [entry, ...prev])
      if (!online) {
        return
      }
      try {
        await insertApplication(session.user.id, post.id, fit)
      } catch {
        changeApps((prev) => prev.filter((a) => a.id !== entry.id))
        toast.error(`Could not log ${post.title}. Try again.`)

        return
      }
      // The server has the row now. A move or removal made while it saved is applied to it, and a later failure keeps it.
      try {
        const rows = await fetchApplications(byId)
        const mine = rows.find((a) => a.posting_id === post.id)
        const local = appsRef.current.find((a) => a.id === entry.id)
        if (mine && !local) {
          await deleteApplication(mine.id)
          setApplications(rows.filter((a) => a.id !== mine.id))

          return
        }
        if (mine && local && local.stage !== mine.stage) {
          await updateStage(mine.id, local.stage)
          mine.stage = local.stage
        }
        setApplications(rows)
      } catch {
        toast.error(`Logged ${post.title}, but could not refresh the list. Reload to see it.`)
      }
    },
    [session, byId, changeApps],
  )

  const changeStage = useCallback(
    async (id: Application["id"], stage: Application["stage"]): Promise<void> => {
      const before = appsRef.current.find((a) => a.id === id)
      changeApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage: stage } : a)))
      if (!before || !onServer(id)) {
        return
      }
      try {
        await updateStage(id, stage)
      } catch {
        changeApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage: before.stage } : a)))
        toast.error(`Could not move ${before.title}. Try again.`)
      }
    },
    [changeApps],
  )

  const removeApplication = useCallback(
    async (id: Application["id"]): Promise<void> => {
      const at = appsRef.current.findIndex((a) => a.id === id)
      const before = appsRef.current[at]
      changeApps((prev) => prev.filter((a) => a.id !== id))
      if (!before || !onServer(id)) {
        return
      }
      try {
        await deleteApplication(id)
      } catch {
        changeApps((prev) => (prev.some((a) => a.id === id) ? prev : [...prev.slice(0, at), before, ...prev.slice(at)]))
        toast.error(`Could not remove ${before.title}. Try again.`)
      }
    },
    [changeApps],
  )

  const refreshPostings = useCallback(async (): Promise<void> => {
    const [postings, logos] = await Promise.all([fetchPostings(), fetchStoredLogos()])
    registerLogos(logos)
    const merged = mergePool(postings)
    setRemote(merged.jobs)
    setAlias(merged.alias)
  }, [])

  const value: Data = {
    status: status,
    sessionChecked: sessionChecked,
    refreshPostings: refreshPostings,
    error: error,
    postings: postings,
    signals: signals,
    byId: byId,
    keptExtra: keptExtra,
    shares: shares,
    collected: collected,
    reference: reference,
    profile: profile,
    profileSaved: profileSaved,
    setProfile: setProfile,
    session: session,
    setSession: setSessionState,
    signOut: () => {
      authSignOut()
      setSessionState(null)
      setProfileSaved(false)
      // The next person on this browser starts with their own answers, not the last one's.
      for (const key of [PROFILE_KEY, SAVED_KEY, PASSED_KEY, REFERRAL_KEY, LOCAL_APPS_KEY, LOCAL_POSTS_KEY]) {
        try {
          window.localStorage.removeItem(key)
        } catch {
          continue
        }
      }
      setProfileState({ ...DEFAULT_PROFILE })
      setLocal([])
      setSaved(new Set())
      setPassedState(new Set())
      setReferrals(new Set())
      setApplications([])
    },
    saved: saved,
    toggleSaved: toggleSaved,
    passed: passed,
    setPassed: setPassed,
    setSaved: setSaved_,
    referrals: referrals,
    strengthFor: facts.strengthFor,
    toggleReferral: toggleReferral,
    people: people,
    addPerson: addPerson,
    updatePerson: updatePerson,
    removePerson: removePerson,
    updatePast: updatePast,
    addLocalPosting: addLocalPosting,
    addLocalPostings: addLocalPostings,
    removeLocalPosting: removeLocalPosting,
    applications: applications,
    logApplication: logApplication,
    changeStage: changeStage,
    removeApplication: removeApplication,
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** Whether an application is a server row (a numeric id), not one kept on this device or still on its way. */
function onServer(id: Application["id"]): boolean {
  return typeof id === "number"
}

/** A short mark of a pool's state (how many postings, the latest fetch), so a kept answer is known to match the data it was made from. */
function stampOf(posts: ReadonlyArray<Posting>): string {
  return `${posts.length}:${posts.reduce((latest, p) => (p.fetched_at && p.fetched_at > latest ? p.fetched_at : latest), "")}`
}
