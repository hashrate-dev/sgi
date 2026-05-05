declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(
    dataBuffer: Buffer,
    options?: { max?: number; pagerender?: (pageData: unknown) => Promise<string> }
  ): Promise<{ text: string; numpages?: number; info?: unknown; metadata?: unknown; version?: string }>;
  export default pdfParse;
}
