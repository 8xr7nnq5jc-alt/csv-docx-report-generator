import test from "node:test";
import assert from "node:assert/strict";
import { generateReportDocx, parseCsv } from "../lib/reportGenerator.js";

test("parses quoted commas, duplicate headers and a UTF-8 BOM", () => {
  const rows = parseCsv('\uFEFFName,Notes,Notes\nMaya,"Strong, follow-up",Ready\n');
  assert.deepEqual(rows, [{
    Name: "Maya",
    Notes: "Strong, follow-up",
    "Notes 2": "Ready"
  }]);
});

test("returns no data rows for a header-only CSV", () => {
  assert.deepEqual(parseCsv("Name,Department\n"), []);
});

test("rejects an unclosed quoted field", () => {
  assert.throws(() => parseCsv('Name,Notes\nMaya,"missing end'), /unclosed quoted field/i);
});

test("generates a DOCX buffer", async () => {
  const buffer = await generateReportDocx({
    rows: [{ Name: "Maya", Department: "Sales" }],
    reportType: "individual",
    originalName: "sample.csv"
  });
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.ok(buffer.length > 1000);
});

