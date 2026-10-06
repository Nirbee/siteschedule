import { describe, expect, it } from "vitest";
import { listZip, readZipEntry } from "@/lib/ingest/zip";
import { buildXlsx } from "./xlsx";

describe("buildXlsx", () => {
  it("writes a readable zip with the sheet, escaped text and merges", () => {
    const file = buildXlsx({
      name: "Список тем",
      widths: [5, 30, 30],
      rows: [
        ["№", "Тема", ""],
        ["1", "Тайна <гос> & служебная", ""],
      ],
      merges: ["B1:C1", "B2:C2"],
    });
    const entries = listZip(file);
    expect(entries.map((e) => e.name)).toContain("xl/worksheets/sheet1.xml");
    const sheet = Buffer.from(
      readZipEntry(
        file,
        entries.find((e) => e.name === "xl/worksheets/sheet1.xml")!,
      ),
    ).toString("utf8");
    expect(sheet).toContain("Тайна &lt;гос&gt; &amp; служебная");
    expect(sheet).toContain('<mergeCell ref="B2:C2"/>');
    const workbook = Buffer.from(
      readZipEntry(
        file,
        entries.find((e) => e.name === "xl/workbook.xml")!,
      ),
    ).toString("utf8");
    expect(workbook).toContain('name="Список тем"');
  });
});
