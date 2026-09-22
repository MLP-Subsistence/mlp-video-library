import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { NextResponse } from "next/server";
import { requireProjectAccess, requireStudioApiUser, StudioError, studioRoute } from "@/lib/studio/access";
import { loadProjectDto } from "@/lib/studio/project-state";
import { formatClock } from "@/lib/studio/timing";

type Params = { params: Promise<{ id: string }> };

/**
 * Script export. `format=docx` streams a Word document; `format=html` returns
 * a print-ready page (the browser's "Save as PDF" keeps every script's fonts,
 * which a server-side PDF library would not for Hindi, Telugu or Arabic).
 */
export const GET = studioRoute(async (request: Request, { params }: Params) => {
  const user = await requireStudioApiUser();
  const { id } = await params;
  await requireProjectAccess(user, id);
  const project = await loadProjectDto(id, user);
  if (!project) throw new StudioError("That localization project could not be found.", 404);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "html" ? "html" : "docx";
  const approvedOnly = url.searchParams.get("approved") !== "0";
  const segments = project.segments.filter((segment) => (approvedOnly ? segment.translationStatus === "approved" : segment.translation.trim().length > 0));
  const filename = `${project.title} - ${project.targetLanguageName}`.replace(/[^\w\- ]+/g, "").trim() || "script";

  if (format === "html") {
    const rows = segments
      .map(
        (segment) => `<tr><td class="key">${escape(segment.key)}</td><td><strong>${escape(segment.title)}</strong><div class="src">${escape(segment.sourceScript)}</div><div class="trn">${escape(segment.translation)}</div></td><td class="dur">${formatClock(segment.pauseBeforeSec + segment.narration.durationSec + segment.pauseAfterSec)}</td></tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(filename)}</title><style>
body{font-family:Inter,Arial,sans-serif;color:#243447;margin:32px;max-width:900px}h1{font-size:24px;margin:0 0 4px}p.meta{color:#6b7c8f;margin:0 0 20px}
table{border-collapse:collapse;width:100%}td{border-top:1px solid #e5e7eb;padding:12px 8px;vertical-align:top;font-size:14px}
td.key{color:#a64026;font-weight:700;white-space:nowrap;width:70px}td.dur{color:#6b7c8f;white-space:nowrap;width:60px;text-align:right}
.src{color:#6b7c8f;margin:4px 0 6px;font-size:13px}.trn{font-size:16px;line-height:1.5}@media print{body{margin:12mm}}
</style></head><body><h1>${escape(project.title)}</h1><p class="meta">${escape(project.targetLanguageName)}${project.region ? ` · ${escape(project.region)}` : ""}${project.variety ? ` · ${escape(project.variety)}` : ""} · ${segments.length} segments · ${formatClock(project.timeline.totalSec)}</p><table><tbody>${rows}</tbody></table><script>if(location.search.includes("print=1"))window.print()</script></body></html>`;
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const doc = new Document({
    creator: "Marketplace Literacy Educator Studio",
    title: filename,
    sections: [
      {
        children: [
          new Paragraph({ text: project.title, heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: `${project.targetLanguageName}${project.region ? ` · ${project.region}` : ""}${project.variety ? ` · ${project.variety}` : ""} · ${segments.length} segments · ${formatClock(project.timeline.totalSec)}`, color: "6B7C8F" })]
          }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: ["Segment", "Original", `Translation (${project.targetLanguageName})`].map(
                  (label) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] })
                )
              }),
              ...segments.map(
                (segment) =>
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: segment.key, bold: true, color: "A64026" })] }), new Paragraph({ text: segment.title })] }),
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: segment.sourceScript, color: "526579" })] })] }),
                      new TableCell({ children: [new Paragraph({ text: segment.translation, alignment: AlignmentType.LEFT })] })
                    ]
                  })
              )
            ]
          })
        ]
      }
    ]
  });
  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}.docx"`
    }
  });
});

function escape(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}
