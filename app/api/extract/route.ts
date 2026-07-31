// AI contract extraction: POST a subcontract PDF, get the key commercial
// terms back for human confirmation. Requires ANTHROPIC_API_KEY; without it
// the route reports that manual entry should be used instead. Extraction is
// assistive only — everything lands on a pre-filled form the user confirms.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";

const extractionSchema = z.object({
  title: z.string().nullish(),
  payerName: z.string().nullish(),
  valueGbp: z.number().nullish(),
  applicationDayOfMonth: z.number().int().min(1).max(31).nullish(),
  daysToDueDate: z.number().int().nullish(),
  daysDueToFinal: z.number().int().nullish(),
  payLessNoticeDaysBeforeFinal: z.number().int().nullish(),
  retentionPercent: z.number().nullish(),
  defectsPeriodMonths: z.number().int().nullish(),
  notes: z.string().nullish(),
});

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI extraction is not configured on this server (no ANTHROPIC_API_KEY). Enter the contract manually instead.",
      },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json({ error: "Upload a PDF." }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF too large (20 MB max)." }, { status: 400 });
  }
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text:
                "This is a UK construction subcontract or order. Extract the commercial payment terms as JSON with exactly these keys (null when the document does not state a value):\n" +
                '{"title": string, "payerName": string, "valueGbp": number, "applicationDayOfMonth": number, "daysToDueDate": number, "daysDueToFinal": number, "payLessNoticeDaysBeforeFinal": number, "retentionPercent": number, "defectsPeriodMonths": number, "notes": string}\n' +
                "- title: short job/project name. payerName: the paying contractor's company name.\n" +
                "- valueGbp: the subcontract sum in pounds.\n" +
                "- applicationDayOfMonth: the day of month applications/claims are to be made.\n" +
                "- daysToDueDate: days from application to the payment due date. daysDueToFinal: days from due date to the final date for payment.\n" +
                "- payLessNoticeDaysBeforeFinal: days before the final date by which a pay less notice must be served.\n" +
                "- retentionPercent: retention percentage. defectsPeriodMonths: defects/rectification period in months.\n" +
                "- notes: one sentence flagging anything unusual about the payment terms.\n" +
                "Reply with ONLY the JSON object.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Extraction failed (upstream ${res.status}). Enter the contract manually.` },
      { status: 502 },
    );
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text =
    data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
  const jsonText = text.startsWith("```")
    ? text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : text;

  try {
    const parsed = extractionSchema.parse(JSON.parse(jsonText));
    return NextResponse.json({ extraction: parsed });
  } catch {
    return NextResponse.json(
      { error: "Could not read terms from this document. Enter the contract manually." },
      { status: 422 },
    );
  }
}
