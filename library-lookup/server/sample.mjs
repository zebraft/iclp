// Synthetic fixtures, never presented as live catalogue results.
export const sampleBooks = [
 {id:'book-1',title:'Sample: Tang institutions',author:'Example Scholar',isbn:'9780306406157',oclcNumber:'900000001'},
 {id:'book-2',title:'Sample: Ritual manuscripts',author:'Example Editor',isbn:'9780140328721',oclcNumber:'900000002'},
 {id:'book-3',title:'Sample: Local administration',author:'Example Researcher',isbn:'9780261103573',oclcNumber:'900000003'}
];
export function sampleProvider() {
 return {
  async search(a) {
   const q=a.query.toLowerCase().replace(/[-\s]/g,'');
   const records=sampleBooks.filter(b=>[b.title,b.author,b.isbn,b.oclcNumber].some(v=>v.toLowerCase().replace(/[-\s]/g,'').includes(q)))
    .filter(b=>a.scope==='worldcat'||b.id!=='book-2').map(b=>({...b,isbns:[b.isbn],format:'PrintBook',catalogUrl:null}));
   return {records,total:records.length,offset:0,nextOffset:null,truncated:false,coverageComplete:false,scope:a.scope||'library',symbol:'SAMPLE',libraryName:'Synthetic test library',checkedAt:new Date().toISOString(),sample:true};
  },
  async locations(id) {
   return {oclcNumber:id,checkedAt:new Date().toISOString(),symbol:'SAMPLE',detailSupported:id!=='900000003',holdings:id==='900000001'?[{branchCode:'DEMO',shelvingLocation:'Sample shelf',callNumber:'TEST 001',summary:'Synthetic example',statements:[]}]:[],coverageComplete:false,sample:true};
  }
 };
}
