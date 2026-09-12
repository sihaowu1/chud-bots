import { PageHeader } from "@/components/shared/page-header";
import { CampaignForm } from "@/components/campaign/campaign-form";

export default function CampaignPage() {
  return (
    <div className="mx-auto max-w-[1480px] px-6 pb-12 pt-5">
      <PageHeader
        title="Campaign"
        description="Tell the agents what you want people to discover"
      />
      <div className="mt-6">
        <CampaignForm />
      </div>
    </div>
  );
}
