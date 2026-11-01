import { requireUser, can } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { assistantStatus } from "@/server/services/insights";
import { ask, setAssistantEnabled } from "@/server/actions/insights";
import { InsightsChat } from "./chat";

export const metadata = { title: "CSC Insights" };

export default async function Insights() {
  const u = await requireUser();
  const status = await assistantStatus();
  return (
    <>
      <PageHeader title="CSC Insights" description="Ask questions about your business in plain English. Answers are built from your records by CSC Command and worded by a private, locally hosted model." />
      <InsightsChat ask={ask} toggle={setAssistantEnabled} status={status} canToggle={can(u, "settings.manage")} />
    </>
  );
}
