import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AbodeFinishedPhotos } from "./AbodeFinishedPhotos";

const photos = [
  { id: "own", fileName: "finished.png", fileUrl: "/api/abode/orders/order/photos/own", createdAt: "2026-11-18", lineItemId: "stocking" },
  { id: "other", fileName: "other.png", fileUrl: "/other", createdAt: "2026-11-18", lineItemId: "another-stocking" },
];
const props = { jobId: "order", lineItemId: "stocking", onChanged: () => {} };

test("staff can drop or select multiple photos for a completed stocking", () => {
  const html = renderToStaticMarkup(<AbodeFinishedPhotos {...props} isStaff canUpload photos={photos} />);
  assert.match(html, /Drag and drop finished photos here/);
  assert.match(html, /multiple=""/);
  assert.match(html, /choose files/);
  assert.match(html, /finished.png/);
  assert.doesNotMatch(html, /other.png/);
});

test("customers see the matching photos without upload controls", () => {
  const html = renderToStaticMarkup(<AbodeFinishedPhotos {...props} isStaff={false} photos={photos} />);
  assert.match(html, /View finished photo: finished.png/);
  assert.match(html, /src="\/api\/abode\/orders\/order\/photos\/own"/);
  assert.doesNotMatch(html, /type="file"|Drag and drop|other.png/);
});

test("unfinished pieces have no upload control and legacy order photos remain visible", () => {
  assert.equal(renderToStaticMarkup(<AbodeFinishedPhotos {...props} isStaff canUpload={false} />), "");
  const html = renderToStaticMarkup(<AbodeFinishedPhotos {...props} lineItemId={null} isStaff={false}
    photos={[{ ...photos[0], lineItemId: null }]} />);
  assert.match(html, /finished.png/);
  assert.doesNotMatch(html, /type="file"/);
});
