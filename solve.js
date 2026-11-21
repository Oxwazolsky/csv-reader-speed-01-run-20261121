// A fast drop-in replacement for csv-reader 1.0.0 (make.fun's reference CSV
// reader). run(input) returns exactly csv-reader's answer for {text, header}:
// {columns, rows, errors}, under csv-reader's broken-row policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled ("" inside it is one quote, and each CRLF or lone CR inside it
//     is read as LF); what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character and the text after it
//     is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on (every LF, CRLF and lone CR inside a quoted field counted),
//     row its record's index in rows (null for the header), in the order met.
//
// Where csv-reader walks the text a character at a time and builds every
// field a character at a time, this reader jumps between the characters that
// matter: fields come out of the text as slices, and only the characters that
// change the reading (a stray CR, a doubled quote, a line break inside
// quotes) take the slow path.

// How the field just read ended: at a comma, at a line break, at the end.
const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on, and the index in rows it
  // takes (null: the header). Every error of the record carries these two.
  let recordLine = 1;
  let recordRow = null;

  // The field just read: how it ended, and how many characters the last
  // readUnquoted call kept (the quote_junk test reads it).
  let fEnded = END;
  let fAdded = 0;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field;
  // sets fEnded and fAdded (the characters kept by this call).
  function readUnquoted(value) {
    let parts = null; // slices kept so far, once a stray CR splits the field
    let kept = 0;
    let seg = pos; // the start of the slice being scanned
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        // ','
        kept += pos - seg;
        const tail = text.slice(seg, pos);
        pos += 1;
        fEnded = COMMA;
        fAdded = kept;
        return parts === null ? value + tail : value + parts.join('') + tail;
      }
      if (c === 10) {
        // LF
        kept += pos - seg;
        const tail = text.slice(seg, pos);
        pos += 1;
        line += 1;
        fEnded = BREAK;
        fAdded = kept;
        return parts === null ? value + tail : value + parts.join('') + tail;
      }
      if (c === 13) {
        // CR
        if (text.charCodeAt(pos + 1) === 10) {
          // CRLF: the record ends.
          kept += pos - seg;
          const tail = text.slice(seg, pos);
          pos += 2;
          line += 1;
          fEnded = BREAK;
          fAdded = kept;
          return parts === null ? value + tail : value + parts.join('') + tail;
        }
        // A lone CR is dropped.
        if (parts === null) parts = [];
        parts.push(text.slice(seg, pos));
        kept += pos - seg;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        seg = pos;
        continue;
      }
      pos += 1;
    }
    kept += pos - seg;
    const tail = text.slice(seg, pos);
    fEnded = END;
    fAdded = kept;
    return parts === null ? value + tail : value + parts.join('') + tail;
  }

  // Appends the quoted segment text[seg, q) to parts, converting each CRLF
  // and lone CR inside it to LF and counting every line break in it. The
  // common segment (no CR in it) is one slice plus a count of its LFs.
  function pushSegment(parts, seg, q) {
    const cr = text.indexOf('\r', seg);
    if (cr === -1 || cr >= q) {
      parts.push(text.slice(seg, q));
      let lf = text.indexOf('\n', seg);
      while (lf !== -1 && lf < q) {
        line += 1;
        lf = text.indexOf('\n', lf + 1);
      }
      return;
    }
    // The segment holds a CR: walk it, one slice per unbroken run.
    let start = seg;
    let i = seg;
    while (i < q) {
      const c = text.charCodeAt(i);
      if (c === 13) {
        parts.push(text.slice(start, i), '\n');
        line += 1;
        i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
        start = i;
        continue;
      }
      if (c === 10) line += 1;
      i += 1;
    }
    parts.push(text.slice(start, q));
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field;
  // sets fEnded (and fAdded, when it falls through to readUnquoted).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    const parts = [];
    let seg = pos; // the start of the segment before the next quote
    let closed = false;
    while (true) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        pos = n;
        break;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: the segment, then one literal quote.
        pushSegment(parts, seg, q);
        parts.push('"');
        pos = q + 2;
        seg = pos;
        continue;
      }
      pushSegment(parts, seg, q);
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    const value = parts.join('');
    if (pos >= n) {
      fEnded = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fEnded = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fEnded = BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnded = BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      fields.push(quoted ? readQuoted() : readUnquoted(''));
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
