import { ApplicationAnswers } from "@/components/ApplicationAnswers"
import { ApplicationQuestions } from "@/components/ApplicationQuestions"
import { FileTextIcon } from "@/components/icons"
import { SavedApplicationQuestions } from "@/components/SavedApplicationQuestions"
import { Section } from "@/components/Section"
import { SetupCard } from "@/components/SetupCard"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { useDocumentStore } from "@/lib/documents"
import { useExtensionPresent } from "@/lib/extension-connect"

/**
 * Everything the Apply button needs, in one place: the CV it uploads, the answers every form asks, what odds learned from forms you filled in, and
 * whether Chrome is connected. The same parts as before, moved here from Profile so Profile is only about you.
 */
export function Autofill({ onDocuments, onJobs }: { onDocuments: () => void; onJobs: () => void }): React.JSX.Element {
  const data = useData()
  const store = useDocumentStore()
  const extension = useExtensionPresent()
  const cv = store.docs.find((d) => d.kind === "cv" && d.isMain) ?? store.docs.find((d) => d.kind === "cv")

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Autofill</h1>

      <SetupCard onJobs={onJobs} onOpenTab={(tab) => { if (tab === "documents") onDocuments(); else document.getElementById("autofill-chrome")?.scrollIntoView({ behavior: "smooth", block: "start" }) }} />

      <Section title="CV">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] bg-card p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <FileTextIcon className="size-5" aria-hidden="true" />
            </span>
            <p className="truncate font-medium">{cv ? cv.fileName || cv.name : "No CV yet"}</p>
          </div>
          <Button type="button" variant="outline" onClick={onDocuments} className="h-10 cursor-pointer rounded-lg px-4">
            {cv ? "Change" : "Add CV"}
          </Button>
        </div>
      </Section>

      {data.session ? (
        <Section id="autofill-answers" title="Answers">
          <ApplicationAnswers />
        </Section>
      ) : null}

      {data.session ? (
        <Section id="autofill-learned" title="Learned from forms">
          <ApplicationQuestions />
          <SavedApplicationQuestions />
        </Section>
      ) : null}

      <Section id="autofill-chrome" title="Chrome">
        <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] bg-card p-4">
          <p className="font-medium">Extension</p>
          <span className={`rounded-md px-2.5 py-1 text-sm font-medium ${extension === "yes" ? "bg-good text-good-foreground" : "border-[1.5px] border-dashed text-muted-foreground"}`}>{extension === "yes" ? "Connected" : extension === "looking" ? "Checking" : "Not connected"}</span>
        </div>
      </Section>
    </div>
  )
}
