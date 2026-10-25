import { loadPage, NoData, byKey, type PageProps } from "@/components/page-kit";
import { Card, PageHeader } from "@/components/ui";
import { GroupTable } from "@/components/GroupTable";

export default async function CreatorsPage(props: PageProps) {
  const { accountId, sp, a, r } = await loadPage(props);
  if (!r) return <NoData accountId={accountId} />;
  return (
    <div className="space-y-4">
      <PageHeader title="Creators" question="Which creators are associated with winners, and how reliably? Associations, not proof of cause." />
      <Card title="Sorted by period spend. Winner rate uses creatives that reached evidence; small samples are flagged.">
        <GroupTable rows={r.groups.creator} cur={a.account.currency} accountId={accountId} sp={sp} byKey={byKey(r)} filterParam="creator" />
      </Card>
    </div>
  );
}
