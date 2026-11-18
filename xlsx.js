// Builds an Excel (.xlsx) file in the browser, with no libraries.
//
// An .xlsx file is a zip of a few small XML files. makeXlsx writes those
// files for one sheet and zips them up (without compressing: simpler, and
// Excel doesn't mind).
//
//   makeXlsx({ sheetName, columns: [{ header, width }], rows: [[...], ...] }) -> Blob
//
// A cell can be text, a number, or a Date (shown as a date in Excel).

(function () {
  const encoder = new TextEncoder();

  // Drop characters XML can't hold at all, and escape the ones it needs escaping
  function xmlText(value) {
    return String(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Column number (0, 1, ... 26) to Excel's letters (A, B, ... AA)
  function columnName(n) {
    let name = "";
    for (n = n + 1; n > 0; n = Math.floor((n - 1) / 26)) {
      name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    }
    return name;
  }

  // Excel counts days from 30 December 1899
  function excelDate(date) {
    const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return (utc - Date.UTC(1899, 11, 30)) / 86400000;
  }

  // Style numbers, matching cellXfs in styles.xml below
  const PLAIN = 1, HEADER = 2, DATE = 3;

  function cellXml(value, ref, header) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date) {
      return `<c r="${ref}" s="${DATE}"><v>${excelDate(value)}</v></c>`;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}" s="${PLAIN}"><v>${value}</v></c>`;
    }
    // Excel won't take more than 32,767 characters in a cell
    const text = String(value).slice(0, 32767);
    return `<c r="${ref}" t="inlineStr" s="${header ? HEADER : PLAIN}"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;
  }

  function sheetXml(columns, rows) {
    const cols = columns.map((c, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 15}" customWidth="1"/>`).join("");
    const all = [columns.map((c) => c.header), ...rows];
    const rowsXml = all.map((row, r) =>
      `<row r="${r + 1}">` + row.map((v, c) => cellXml(v, columnName(c) + (r + 1), r === 0)).join("") + `</row>`
    ).join("");
    const last = columnName(columns.length - 1) + all.length;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      // Keep the header row in view while scrolling
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<cols>${cols}</cols><sheetData>${rowsXml}</sheetData>` +
      // Filter buttons on the header row
      `<autoFilter ref="A1:${last}"/></worksheet>`;
  }

  const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  function files(sheetName, columns, rows) {
    // Sheet names can't have \ / ? * [ ] : and stop at 31 characters
    const name = sheetName.replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31).trim() || "Sheet1";
    const range = `'${name.replace(/'/g, "''")}'!$A$1:$${columnName(columns.length - 1)}$${rows.length + 1}`;
    return {
      "[Content_Types].xml": XML +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
      "_rels/.rels": XML +
        `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${DOC}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "xl/workbook.xml": XML +
        `<workbook xmlns="${MAIN}" xmlns:r="${DOC}"><sheets><sheet name="${xmlText(name)}" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xmlText(range)}</definedName></definedNames></workbook>`,
      "xl/_rels/workbook.xml.rels": XML +
        `<Relationships xmlns="${RELS}">` +
        `<Relationship Id="rId1" Type="${DOC}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${DOC}/styles" Target="styles.xml"/></Relationships>`,
      // Styles: 0 default, 1 text that wraps, 2 bold header, 3 date
      "xl/styles.xml": XML +
        `<styleSheet xmlns="${MAIN}">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="d mmm yyyy"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="4">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      "xl/worksheets/sheet1.xml": sheetXml(columns, rows),
    };
  }

  // --- Zipping ---------------------------------------------------------------

  const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Store each file uncompressed, then write the zip's table of contents
  function zip(entries) {
    const parts = [];
    const directory = [];
    let offset = 0;
    let count = 0;
    for (const [name, text] of Object.entries(entries)) {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034B50, true);   // local file header
      local.setUint16(4, 20, true);           // version needed
      local.setUint16(6, 0x0800, true);       // names are UTF-8
      local.setUint16(8, 0, true);            // stored, not compressed
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(local, nameBytes, data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014B50, true);  // central directory header
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint32(42, offset, true);
      directory.push(central, nameBytes);

      offset += 30 + nameBytes.length + data.length;
      count += 1;
    }
    const size = directory.reduce((n, part) => n + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true);        // end of central directory
    end.setUint16(8, count, true);
    end.setUint16(10, count, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  globalThis.makeXlsx = function ({ sheetName = "Sheet1", columns, rows }) {
    return zip(files(sheetName, columns, rows));
  };
})();
