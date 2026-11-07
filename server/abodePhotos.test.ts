import assert from "node:assert/strict";
import { test } from "node:test";
import { FINISHED_PHOTO_PREFIX, isFinishedPhoto, photoBytesMatchType } from "./abodePhotos";

test("finished photos exclude customer uploads and ordinary job artwork", () => {
  const photo = { uploadedBy: "staff", fileName: `${FINISHED_PHOTO_PREFIX}stocking.png`, fileType: "image/png" };
  assert.equal(isFinishedPhoto(photo), true);
  assert.equal(isFinishedPhoto({ ...photo, uploadedBy: "customer" }), false);
  assert.equal(isFinishedPhoto({ ...photo, fileName: "artwork.png" }), false);
  assert.equal(isFinishedPhoto({ ...photo, fileType: "image/svg+xml" }), false);
});

test("photo signatures reject disguised HTML and SVG", () => {
  assert.equal(photoBytesMatchType(Buffer.from([255, 216, 255, 224]), "image/jpeg"), true);
  assert.equal(photoBytesMatchType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"), true);
  assert.equal(photoBytesMatchType(Buffer.from("RIFF1234WEBP"), "image/webp"), true);
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]) {
    assert.equal(photoBytesMatchType(Buffer.from("<svg onload="), type), false);
    assert.equal(photoBytesMatchType(Buffer.alloc(0), type), false);
  }
});
