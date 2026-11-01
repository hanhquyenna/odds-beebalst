/**
 * When reading a LinkedIn profile fails, is it on our side (the paid reader is out of credit, over its limit, or not answering), so the
 * CV should lead? Or is it about the profile (private, not found), where the message is the person's to act on? Messages are the ones
 * supabase/functions/profile/import.ts sends.
 */
export function failureIsOurs(said: string): boolean {
  return !said || /paused|did not answer|switched on|could not read that profile/i.test(said)
}
