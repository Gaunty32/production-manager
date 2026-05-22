import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import type { Job, Customer, JobLineItem } from "@shared/schema";

interface CustomerPickingSlipProps {
  customer: Customer;
  jobs: Job[];
  lineItemsByJob: Record<string, JobLineItem[]>;
  onClose: () => void;
}

export function CustomerPickingSlip({ customer, jobs, lineItemsByJob, onClose }: CustomerPickingSlipProps) {
  const handlePrint = () => window.print();

  const totalLineItems = jobs.reduce((sum, j) => sum + (lineItemsByJob[j.id]?.length ?? 0), 0);
  const totalQty = jobs.reduce(
    (sum, j) => sum + (lineItemsByJob[j.id]?.reduce((s, li) => s + (li.quantity || 0), 0) ?? 0),
    0,
  );

  return (
    <div id="picking-slip-root" className="fixed inset-0 bg-background z-50 overflow-auto">
      <div className="print:hidden sticky top-0 z-10 bg-background border-b p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Consolidated Picking Slip — {customer.name}</h2>
        <div className="flex gap-2">
          <Button onClick={handlePrint} data-testid="button-print-picking-slip">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="button-close-picking-slip">
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8 print:p-0">
        <div className="bg-white text-black">
          {/* Header */}
          <div className="border-b-4 border-black pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-4xl font-bold print:text-2xl">{customer.name}</h1>
                <p className="text-lg text-gray-700 mt-1 print:text-base">Consolidated Picking Slip</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-gray-600">Printed</p>
                <p className="font-semibold">{format(new Date(), "dd/MM/yyyy HH:mm")}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
              <div>
                <p className="text-gray-600">Jobs</p>
                <p className="text-2xl font-bold print:text-xl">{jobs.length}</p>
              </div>
              <div>
                <p className="text-gray-600">Line items</p>
                <p className="text-2xl font-bold print:text-xl">{totalLineItems}</p>
              </div>
              <div>
                <p className="text-gray-600">Total units</p>
                <p className="text-2xl font-bold print:text-xl">{totalQty}</p>
              </div>
            </div>
          </div>

          {/* Jobs */}
          {jobs.map((job, idx) => {
            const lineItems = lineItemsByJob[job.id] ?? [];
            return (
              <div
                key={job.id}
                className={`mb-6 ${idx > 0 ? "pt-6 border-t-2 border-gray-300 print:break-inside-avoid" : ""}`}
                data-testid={`picking-job-${job.id}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold print:text-lg">{job.jobName}</h2>
                    <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                      {job.jobNumber && <span>Job #{job.jobNumber}</span>}
                      {job.poNumber && <span>PO: {job.poNumber}</span>}
                      {job.requiredDispatchDate && (
                        <span>Dispatch: {format(new Date(job.requiredDispatchDate), "dd/MM/yyyy")}</span>
                      )}
                      {job.goodsReceived && (
                        <span>Goods in: {format(new Date(job.goodsReceived), "dd/MM/yyyy")}</span>
                      )}
                    </div>
                  </div>
                  <div className="w-7 h-7 border-2 border-black shrink-0 ml-3" title="Tick when picked" />
                </div>

                {lineItems.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No line items.</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-black print:bg-white">
                        <th className="text-left py-1.5 px-2 font-semibold">Type</th>
                        <th className="text-left py-1.5 px-2 font-semibold">Description</th>
                        <th className="text-center py-1.5 px-2 font-semibold w-16">Qty</th>
                        <th className="text-center py-1.5 px-2 font-semibold w-12">✓</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map(item => (
                        <tr key={item.id} className="border-b">
                          <td className="py-2 px-2">{item.jobType}</td>
                          <td className="py-2 px-2 text-gray-700">{item.description || "—"}</td>
                          <td className="py-2 px-2 text-center font-semibold">{item.quantity}</td>
                          <td className="py-2 px-2 text-center">
                            <div className="w-5 h-5 border-2 border-black inline-block" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {job.notes && (
                  <div className="mt-2 p-2 border border-gray-300 text-xs">
                    <span className="font-semibold">Notes: </span>
                    <span className="whitespace-pre-wrap">{job.notes}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Sign-off */}
          <div className="grid grid-cols-2 gap-6 mt-8 pt-6 border-t-2 border-black print:break-inside-avoid">
            <div>
              <p className="text-sm font-medium mb-2">Picked By:</p>
              <div className="border-b-2 border-black h-10" />
              <p className="text-xs text-gray-600 mt-1">Signature</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Date:</p>
              <div className="border-b-2 border-black h-10" />
              <p className="text-xs text-gray-600 mt-1">Date</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
