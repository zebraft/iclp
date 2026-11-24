export const VERSION = '0.3.0';
export const UI_URI = 'ui://library-selection/books-v1.html';
const string = (maxLength = 300) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const bookSchema = object({
  id: { ...string(64), pattern: '^[A-Za-z0-9_-]+$' }, title: string(), author: string(),
  isbn: string(32), oclcNumber: { ...string(20), pattern: '^[0-9]+$' },
  year: string(30), publisher: string(), edition: string(200), format:string(100), volume:string(100), rationale: string(1000)
}, ['id', 'title']);
const books = maxItems => ({ type: 'array', items: bookSchema, minItems: 1, maxItems });
const annotate = openWorldHint => ({ readOnlyHint: true, destructiveHint: false, openWorldHint });
export const tools = [
  { name: 'library_status', description: 'Read configured library, mode, scope and limits for diagnostics. Ordinary lookup tools validate configuration themselves. No secrets returned.', inputSchema: object({}), annotations: annotate(false) },
  { name: 'prepare_book_list', description: 'Normalize up to 30 records, validate ISBNs and flag duplicate IDs/identifiers. Preserves caller IDs; does not search holdings.', inputSchema: object({ books: books(30) }), annotations: annotate(false) },
  { name: 'search_library_catalog', description: 'Search catalogue records of any material type, ten per page. Default scope=library; as is its legacy alias; worldcat searches worldwide without establishing local ownership. Preserve scope and nextOffset when paging. kind=keyword supports topic discovery. Returns bibliography, formats, links and timestamps. For a specific book, set includeLocations=true to return its locations in this call (up to locationLimit, default 1, maximum 2). Set refresh=true to bypass the short-lived cache.', inputSchema: object({ query: string(), kind: { type: 'string', enum: ['title','author','keyword','isbn','issn','oclc'] }, scope: { type: 'string', enum: ['library','as','worldcat'] }, offset: { type: 'integer', minimum: 0, maximum: 200 }, includeLocations:{type:'boolean'}, locationLimit:{type:'integer',minimum:1,maximum:2}, refresh:{type:'boolean'} }, ['query']), annotations: annotate(true) },
  { name: 'search_articles', description: 'Search article candidates by title/author/keyword; optionally search their host journal by ISSN or journalTitle. Default scope=library (legacy as); worldcat searches worldwide. Catalogue indexing is incomplete. Article and journal candidate sets are separate; neither proves issue coverage or full-text access.', inputSchema: object({ query: string(), kind: {type:'string',enum:['title','author','keyword']}, scope:{type:'string',enum:['library','as','worldcat']}, offset:{type:'integer',minimum:0,maximum:200}, issn:{...string(9),pattern:'^[0-9]{4}-?[0-9]{3}[0-9Xx]$'}, journalTitle:string() }, ['query']), annotations:annotate(true) },
  { name: 'get_library_locations', description: 'Read public branch codes, collection, shelves, call numbers and serial statements for an OCLC record in the configured library. Keep branch and collection codes distinct. Optional citationYear assesses explicit reported year ranges only. No live circulation, patron data or barcodes.', inputSchema: object({ oclcNumber: { ...string(20), pattern: '^[0-9]+$' },citationYear:{type:'integer',minimum:1000,maximum:2999},refresh:{type:'boolean'} },['oclcNumber']), annotations: annotate(true) },
  { name: 'check_holdings', description: 'Check 1–3 supplied records using OCLC/ISBN or title, with timestamped local evidence and identity warnings. Preserve original IDs. Identifiers, editions and formats require review; a bounded no-match never establishes institution-wide absence. Errors remain per-item failures.', inputSchema: object({ books: books(3),refresh:{type:'boolean'} },['books']), annotations: annotate(true) },
  { name: 'export_selection', description: 'Return formula-safe CSV for selected IDs from up to 30 supplied records. Preserves identifiers, editions, formats and volumes. Does not save, email, submit, write a worksheet or purchase.', inputSchema: object({ books: books(30), selectedIds: { type: 'array', items: string(64), uniqueItems: true, maxItems: 30 } }), annotations: annotate(false) }
];
export class UserError extends Error { constructor(code, message) { super(message); this.code = code; } }
export function validate(value, schema, path = 'input') {
  const fail = () => { throw new UserError('invalid_input', `Invalid ${path}; check the tool input schema. / 輸入格式不符`); };
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    if ((schema.required || []).some(k => !Object.hasOwn(value,k))) fail();
    for (const k of Object.keys(value)) { if (!Object.hasOwn(schema.properties,k)) fail(); validate(value[k],schema.properties[k],`${path}.${k}`); }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > schema.maxItems) fail();
    if (schema.uniqueItems && new Set(value).size !== value.length) fail();
    value.forEach((x,i) => validate(x,schema.items,`${path}[${i}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || !value.trim() || value.length > schema.maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail();
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail();
  } else if (schema.type === 'boolean') {
    if(typeof value!=='boolean') fail();
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) fail();
  }
  if (schema.enum && !schema.enum.includes(value)) fail();
}
export function normalizeISBN(raw) {
  const s = String(raw ?? '').replace(/[-\s]/g,'').toUpperCase();
  if (/^\d{13}$/.test(s) && [...s].reduce((sum,n,i) => sum + Number(n)*(i%2 ? 3 : 1),0)%10 === 0) return s;
  if (/^\d{9}[\dX]$/.test(s) && [...s].reduce((sum,n,i) => sum + (n==='X'?10:Number(n))*(10-i),0)%11 === 0) return '978'+s.slice(0,9)+String((10-[...('978'+s.slice(0,9))].reduce((sum,n,i)=>sum+Number(n)*(i%2?3:1),0)%10)%10);
  throw new UserError('invalid_isbn','ISBN checksum or format is invalid. / ISBN 檢查碼或格式不符');
}
export function normalizeBooks(input) {
  const ids = new Set(), seen = new Map();
  return input.map(b => {
    if (ids.has(b.id)) throw new UserError('duplicate_id','Book IDs must be unique; keep the original numbering.');
    ids.add(b.id);
    const book = Object.fromEntries(Object.entries(b).map(([k,v])=>[k,v.trim()]));
    if (book.isbn) book.isbn = normalizeISBN(book.isbn);
    const key = book.isbn || (book.oclcNumber ? 'oclc:'+book.oclcNumber : 'title:'+book.title.normalize('NFKC').toLowerCase()+'|'+(book.author||'').normalize('NFKC').toLowerCase());
    const duplicateOf = seen.get(key) || null;
    if (!duplicateOf) seen.set(key,book.id);
    return { ...book, duplicateOf };
  });
}
