import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import type { JobWithLineItems, Customer } from "@shared/schema";
import { getMachineName } from "@shared/machines";

interface ProductionWorksheetProps {
  job: JobWithLineItems;
  customer: Customer;
  onClose: () => void;
}

export function ProductionWorksheet({ job, customer, onClose }: ProductionWorksheetProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-auto">
      {/* Print button bar - hide when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-background border-b p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Production Worksheet</h2>
        <div className="flex gap-2">
          <Button onClick={handlePrint} data-testid="button-print-worksheet">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="button-close-worksheet">
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>

      {/* Worksheet content - optimized for printing */}
      <div className="max-w-4xl mx-auto p-8 print:p-0">
        <div className="bg-white text-black print:shadow-none">
          {/* Header Section */}
          <div className="border-b-4 border-black pb-4 mb-6">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h1 className="text-2xl font-bold">
                  Required: {job.requiredDispatchDate ? format(job.requiredDispatchDate, "dd/MM/yyyy") : "TBA"}
                </h1>
                <p className="text-xl font-semibold mt-1">{customer.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Job Number</p>
                <p className="text-3xl font-bold">#{job.jobNumber || "N/A"}</p>
              </div>
            </div>
            <h2 className="text-xl font-semibold mt-2">{job.jobName}</h2>
            {job.poNumber && (
              <p className="text-sm text-gray-600 mt-1">PO Number: {job.poNumber}</p>
            )}
          </div>

          {/* Job Details Section */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="font-semibold text-sm uppercase text-gray-600 mb-2">Order Information</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Total Quantity:</td>
                    <td className="py-2 text-right">{job.quantity}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Goods Received:</td>
                    <td className="py-2 text-right">
                      {job.goodsReceived ? format(job.goodsReceived, "dd/MM/yyyy") : "Not received"}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Dispatch Required:</td>
                    <td className="py-2 text-right font-semibold">
                      {job.requiredDispatchDate ? format(job.requiredDispatchDate, "dd/MM/yyyy") : "TBA"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-semibold text-sm uppercase text-gray-600 mb-2">Contact Details</h3>
              <table className="w-full text-sm">
                <tbody>
                  {customer.contactFirstName && (
                    <tr className="border-b">
                      <td className="py-2 font-medium">Contact:</td>
                      <td className="py-2 text-right">
                        {customer.contactFirstName} {customer.contactLastName}
                      </td>
                    </tr>
                  )}
                  {customer.telephone && (
                    <tr className="border-b">
                      <td className="py-2 font-medium">Phone:</td>
                      <td className="py-2 text-right">{customer.telephone}</td>
                    </tr>
                  )}
                  {customer.email && (
                    <tr className="border-b">
                      <td className="py-2 font-medium">Email:</td>
                      <td className="py-2 text-right">{customer.email}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Line Items Section */}
          <div className="mb-6">
            <h3 className="font-semibold text-sm uppercase text-gray-600 mb-3 pb-2 border-b-2 border-black">
              Production Line Items
            </h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-black">
                  <th className="text-left py-2 px-2 font-semibold">Type</th>
                  <th className="text-center py-2 px-2 font-semibold">Qty</th>
                  <th className="text-center py-2 px-2 font-semibold">Stitch Count</th>
                  <th className="text-center py-2 px-2 font-semibold">Logo</th>
                  <th className="text-center py-2 px-2 font-semibold">Machine</th>
                  <th className="text-center py-2 px-2 font-semibold">✓</th>
                </tr>
              </thead>
              <tbody>
                {job.lineItems && job.lineItems.map((item, index) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-3 px-2">
                      {item.jobType}
                      {item.description && (
                        <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                      )}
                    </td>
                    <td className="text-center py-3 px-2 font-semibold">{item.quantity}</td>
                    <td className="text-center py-3 px-2">
                      {item.jobType !== "Print" && item.jobType !== "Print Initials/Name" 
                        ? item.stitchCount.toLocaleString()
                        : "—"
                      }
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className={item.logoApproved ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {item.logoApproved ? "✓" : "✗"}
                      </span>
                    </td>
                    <td className="text-center py-3 px-2">
                      {item.machineId ? getMachineName(item.machineId) : "—"}
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="w-6 h-6 border-2 border-black inline-block"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes Section */}
          {job.notes && (
            <div className="mb-6 p-4 border-2 border-black">
              <h3 className="font-semibold text-sm uppercase text-gray-600 mb-2">Production Notes</h3>
              <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {/* Sign-off Section */}
          <div className="grid grid-cols-2 gap-6 mt-8 pt-6 border-t-2 border-black">
            <div>
              <p className="text-sm font-medium mb-2">Completed By:</p>
              <div className="border-b-2 border-black h-12"></div>
              <p className="text-xs text-gray-600 mt-1">Signature</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Date Completed:</p>
              <div className="border-b-2 border-black h-12"></div>
              <p className="text-xs text-gray-600 mt-1">Date</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-xs text-gray-500 text-center print:block">
            Printed: {format(new Date(), "dd/MM/yyyy HH:mm")}
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          @page {
            margin: 1cm;
          }
        }
      `}</style>
    </div>
  );
}
