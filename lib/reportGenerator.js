import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

export function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const source = String(csvText ?? "").replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (inQuotes) throw new Error("CSV contains an unclosed quoted field.");

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length <= 1) return [];

  const usedHeaders = new Set();
  const headers = rows[0].map((header, index) => {
    const base = header || `Column ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (usedHeaders.has(name)) name = `${base} ${suffix++}`;
    usedHeaders.add(name);
    return name;
  });

  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""])
  ));
}

function cell(text, bold = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text ?? "-") || "-", bold })]
      })
    ]
  });
}

function buildTable(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 6);
  const tableRows = [
    new TableRow({ children: headers.map((header) => cell(header, true)) }),
    ...rows.slice(0, 20).map((row) => new TableRow({
      children: headers.map((header) => cell(row[header]))
    }))
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows
  });
}

function metricParagraph(label, value) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun(String(value))
    ]
  });
}

export async function generateReportDocx({ rows, reportType, originalName }) {
  const title = reportType === "team" ? "Team Report" : "Individual Report";
  const firstRow = rows[0] || {};
  const firstName = firstRow.Name || firstRow.name || firstRow.Client || firstRow.client || "Sample record";

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: title, bold: true, size: 36 })]
          }),
          metricParagraph("Source file", originalName),
          metricParagraph("Rows processed", rows.length),
          metricParagraph("First record", firstName),
          metricParagraph("Generated", new Date().toLocaleString()),
          new Paragraph({
            spacing: { before: 240, after: 160 },
            children: [new TextRun({ text: "Preview Data", bold: true, size: 28 })]
          }),
          buildTable(rows),
          new Paragraph({
            spacing: { before: 240 },
            children: [
              new TextRun("This MVP can be customized with branded templates, editable report copy, charts, and cloud deployment.")
            ]
          })
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}

