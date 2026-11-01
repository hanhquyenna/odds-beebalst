# Draft: navigation-aware browser action results and phase timing

Target: github.com/beeblastco/broods. Draft only; not submitted.

Odds runs a single Broods agent through a stateless MCP server and an extension queue. Browser navigation unloads the content script, so a click result must be acknowledged before the page unloads. Returning only that acknowledgment makes the agent spend another 4–6 seconds deciding to call read_page. Our workaround flags page_pending and internally queues a post-navigation snapshot, then returns it as the original action result.

A native action protocol that distinguishes accepted, navigation-started and resulting-document-ready would remove this extra coordination and make safe retries easier. It should correlate the action to a document ID, preserve one run across unloads, expose time spent thinking versus queued versus acting, and never require a duplicate click when a result is delayed. Screenshots should expose image and CSS viewport dimensions separately so downscaled click coordinates remain exact.

Acceptance: a click that changes document returns the resulting page once, with no second model turn, no focus change and no duplicate action. If the document never arrives, the result names that failure rather than implying the form is ready. Tests should cover same-document dialogs, full navigation, redirects, background tabs, missing pages and user-controlled authentication/captcha.
