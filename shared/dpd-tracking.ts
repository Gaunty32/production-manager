type TrackingJob = {
  dhlTrackingNumber?: string | null;
  deliveryAddressType?: string | null;
  deliveryAddress?: string | null;
};

function extractUkPostcode(address: string | null | undefined): string | null {
  const match = address?.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  return match ? match[1].replace(/\s+/, " ").toUpperCase() : null;
}

/** DPD validates the recipient's postcode, not the customer's account postcode. */
export function getDpdTrackingUrl(job: TrackingJob, customerAddress?: string | null): string {
  const customDelivery = job.deliveryAddressType === "custom"
    || (!job.deliveryAddressType && !!job.deliveryAddress?.trim());
  const postcode = extractUkPostcode(customDelivery ? job.deliveryAddress : customerAddress);
  const params = new URLSearchParams({ reference: job.dhlTrackingNumber?.trim() || "" });
  // Never substitute the account postcode for an incomplete custom address.
  // Without a postcode, DPD lets the recipient enter it themselves.
  if (postcode) params.set("postcode", postcode);
  return `https://track.dpdlocal.co.uk/search?${params}`;
}
