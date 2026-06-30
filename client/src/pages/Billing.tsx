import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useDialog } from "../context/DialogContext";
import { Loading, EmptyState, useSort, SortTh } from "../components/ui";

interface WipRow {
  clientId: string;
  clientName: string;
  clientType: string | null;
  wipHours: number;
  wipValue: number;
  billedTotal: number;
  openEngagements: number;
}

interface WipResponse {
  rows: WipRow[];
  totals: { wipHours: number; wipValue: number; billedTotal: number };
}

function currency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function Billing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { prompt } = useDialog();
  const { data, isLoading } = useQuery<WipResponse>({
    queryKey: ["billing-wip"],
    queryFn: async () => (await api.get("/billing/wip")).data,
  });

  const bill = useMutation({
    mutationFn: async ({ clientId, amount }: { clientId: string; amount: number; clientName: string }) =>
      (await api.post("/billing/bill", { clientId, amount })).data,
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["billing-wip"] });
      queryClient.invalidateQueries({ queryKey: ["firm-summary"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      toast(`Billed ${vars.clientName} ${currency(vars.amount)}.`);
    },
    onError: (err: any) => toast(err.response?.data?.error || "Could not bill this client.", "error"),
  });

  async function handleBill(r: WipRow) {
    const input = await prompt({
      title: `Bill ${r.clientName}`,
      message: `Outstanding WIP is ${currency(r.wipValue)} across ${r.openEngagements} return(s). Enter the amount actually billed:`,
      defaultValue: r.wipValue.toFixed(2),
      confirmLabel: "Bill",
      numeric: true,
    });
    if (input === null) return;
    const amount = Number(input);
    if (Number.isNaN(amount) || amount < 0) {
      toast("Please enter a valid amount.", "error");
      return;
    }
    bill.mutate({ clientId: r.clientId, amount, clientName: r.clientName });
  }

  const sort = useSort<WipRow>(data?.rows ?? [], "wipValue", "desc");

  function exportExcel() {
    if (!data) return;
    const rows = data.rows.map((r) => ({
      Client: r.clientName,
      Type: r.clientType ?? "",
      "Open Returns": r.openEngagements,
      "Unbilled Hours": Number(r.wipHours.toFixed(1)),
      "Outstanding WIP": Number(r.wipValue.toFixed(2)),
      "Billed to Date": Number(r.billedTotal.toFixed(2)),
    }));
    rows.push({
      Client: "TOTAL",
      Type: "",
      "Open Returns": data.rows.reduce((s, r) => s + r.openEngagements, 0),
      "Unbilled Hours": Number(data.totals.wipHours.toFixed(1)),
      "Outstanding WIP": Number(data.totals.wipValue.toFixed(2)),
      "Billed to Date": Number(data.totals.billedTotal.toFixed(2)),
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WIP");
    XLSX.writeFile(wb, `billing-wip-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Exported billing-wip.xlsx");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Billing</h1>
          <p className="text-sm text-gray-500">
            Outstanding WIP (work in progress) — the standard value of logged time not yet billed, by client.
            Time on returns marked "Billed" is excluded.
          </p>
        </div>
        <button
          className="bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
          onClick={exportExcel}
          disabled={!data || data.rows.length === 0}
        >
          Export to Excel
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs font-medium text-gray-500 uppercase">Total Outstanding WIP</div>
            <div className="text-2xl font-bold text-brand-600">{currency(data.totals.wipValue)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs font-medium text-gray-500 uppercase">Unbilled Hours</div>
            <div className="text-2xl font-bold text-gray-800">{data.totals.wipHours.toFixed(1)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs font-medium text-gray-500 uppercase">Billed to Date</div>
            <div className="text-2xl font-bold text-gray-800">{currency(data.totals.billedTotal)}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <SortTh<WipRow> field="clientName" label="Client" sort={sort} />
              <SortTh<WipRow> field="clientType" label="Type" sort={sort} />
              <SortTh<WipRow> field="openEngagements" label="Open Returns" sort={sort} align="right" />
              <SortTh<WipRow> field="wipHours" label="Unbilled Hours" sort={sort} align="right" />
              <SortTh<WipRow> field="wipValue" label="Outstanding WIP" sort={sort} align="right" />
              <SortTh<WipRow> field="billedTotal" label="Billed to Date" sort={sort} align="right" />
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7}><Loading /></td></tr>
            )}
            {sort.sorted.map((r) => (
              <tr key={r.clientId} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 px-4">
                  <Link to={`/clients/${r.clientId}`} className="text-brand-600 hover:underline font-medium">
                    {r.clientName}
                  </Link>
                </td>
                <td className="py-2 px-4 text-gray-600">{r.clientType ?? "-"}</td>
                <td className="py-2 px-4 text-right text-gray-600">{r.openEngagements}</td>
                <td className="py-2 px-4 text-right text-gray-600">{r.wipHours.toFixed(1)}</td>
                <td className="py-2 px-4 text-right font-medium text-gray-800">{currency(r.wipValue)}</td>
                <td className="py-2 px-4 text-right text-gray-600">{currency(r.billedTotal)}</td>
                <td className="py-2 px-4 text-right">
                  <button
                    className="bg-brand-600 text-white text-xs font-medium rounded px-3 py-1 hover:bg-brand-700 disabled:opacity-50"
                    onClick={() => handleBill(r)}
                    disabled={bill.isPending || r.wipValue <= 0}
                  >
                    Bill
                  </button>
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No outstanding WIP" hint="All logged time has been billed." /></td></tr>
            )}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-gray-50 font-semibold text-gray-800">
                <td className="py-2 px-4" colSpan={3}>Total</td>
                <td className="py-2 px-4 text-right">{data.totals.wipHours.toFixed(1)}</td>
                <td className="py-2 px-4 text-right">{currency(data.totals.wipValue)}</td>
                <td className="py-2 px-4 text-right">{currency(data.totals.billedTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
