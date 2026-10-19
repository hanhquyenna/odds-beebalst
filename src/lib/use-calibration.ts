import { useEffect, useState } from "react"
import { useData } from "@/lib/data"
import { calibrate, fromPooled, type CalibrationBucket, type CalibrationRow, type PooledRow } from "@/lib/calibration"
import { supabase } from "@/lib/supabase"

export interface CalibrationData {
  /** This person's own applications. */
  mine: CalibrationBucket[]
  /** Everyone using Odds, counts only. Empty until it has loaded or if the database function is not there yet. */
  everyone: CalibrationBucket[]
  loaded: boolean
}

let pooledCache: Promise<PooledRow[]> | null = null
const pooled = (): Promise<PooledRow[]> => {
  pooledCache ??= Promise.resolve(supabase.rpc("chance_calibration_pooled")).then(({ data, error }) => (!error && Array.isArray(data) ? (data as PooledRow[]) : [])).catch(() => [])

  return pooledCache
}

/** Was the chance right: the person's own results and everyone's, read once for a signed-in person. */
export function useCalibration(): CalibrationData {
  const userId = useData().session?.user.id ?? null
  const [state, setState] = useState<CalibrationData>({ mine: calibrate([]), everyone: fromPooled([]), loaded: false })
  useEffect(() => {
    if (!userId) return
    let live = true
    const own = Promise.resolve(supabase.from("chance_snapshots").select("chance,applied_on,outcome")).then(({ data, error }) => (!error && Array.isArray(data) ? (data as CalibrationRow[]) : []))
    void Promise.all([own.catch(() => []), pooled()]).then(([rows, all]) => {
      if (live) setState({ mine: calibrate(rows), everyone: fromPooled(all), loaded: true })
    })

    return () => {
      live = false
    }
  }, [userId])

  return state
}
