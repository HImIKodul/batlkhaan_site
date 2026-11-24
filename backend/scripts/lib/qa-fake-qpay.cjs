/* LOCAL stand-in for QPay Merchant V2 used by the browser payment test. Nothing leaves the machine. GET /__state, GET /__pay/<invoice>. */
const http = require('http'), crypto = require('crypto');
const inv = new Map(), paid = new Map(), cancelled = new Set(), n = { check: 0, invoice: 0 };
let tok = '';
const BANKS = [['Khan bank', 'Хаан банк', 'khanbank'], ['State bank', 'Төрийн банк', 'statebank'], ['TDB online', 'Худалдаа хөгжлийн банк', 'tdbbank'], ['Golomt bank', 'Голомт банк', 'golomtbank'], ['Xac bank', 'Хас банк', 'xacbank'], ['M bank', 'М банк', 'mbank']];
http.createServer((q, r) => {
  let s = ''; q.on('data', d => { s += d; });
  q.on('end', () => {
    const J = (c, b) => { r.writeHead(c, { 'content-type': 'application/json' }); r.end(JSON.stringify(b)); };
    const u = q.url, b = s ? JSON.parse(s) : {};
    if (u === '/__state') return J(200, { n, invoices: [...inv.keys()], cancelled: [...cancelled] });
    if (u.startsWith('/__pay/')) { paid.set(u.split('/')[2], [{ payment_id: Date.now(), payment_status: 'PAID', payment_amount: '300000.00', payment_currency: 'MNT' }]); return J(200, {}); }
    if (u === '/v2/auth/token') { tok = 't' + crypto.randomUUID(); return J(200, { access_token: tok, expires_in: Math.floor(Date.now() / 1000) + 86400 }); }
    if (q.headers.authorization !== 'Bearer ' + tok) return J(401, {});
    if (u === '/v2/invoice') {
      n.invoice++; const id = crypto.randomUUID(); inv.set(id, b);
      return J(200, { invoice_id: id, qr_text: '0002010102121531279404962794049600022310027' + id.replace(/-/g, '') + '5204739953034965406300000', qr_image: '', qPay_shortUrl: 'https://s.qpay.mn/' + id.slice(0, 8), urls: BANKS.map(([a, d, c]) => ({ name: a, description: d, logo: '', link: c + '://q?qPay_QRcode=' + id })) });
    }
    if (q.method === 'DELETE') { cancelled.add(u.split('/').pop()); return J(200, {}); }
    if (u === '/v2/payment/check') { n.check++; const rows = paid.get(b.object_id) || []; return J(200, { count: rows.length, rows }); }
    if (u.startsWith('/v2/payment/')) for (const [i, rows] of paid) for (const x of rows) if (String(x.payment_id) === u.split('/').pop()) return J(200, { ...x, object_type: 'INVOICE', object_id: i });
    J(404, {});
  });
}).listen(Number(process.argv[2] || 4499), '127.0.0.1');
