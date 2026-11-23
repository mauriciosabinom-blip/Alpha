// Pix "copia e cola" (BR Code / EMV) com valor fixo — padrão do Banco Central do Brasil.
(function () {
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
  function crc16(s) { // CRC16-CCITT (polinômio 0x1021, início 0xFFFF)
    let c = 0xFFFF;
    for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }
  const clean = (s, n) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, n);
  window.pixPayload = function ({ key, amount, name, city, txid = '***' }) {
    const mai = f('00', 'br.gov.bcb.pix') + f('01', key);
    let p = f('00', '01') + f('26', mai) + f('52', '0000') + f('53', '986');
    if (amount) p += f('54', Number(amount).toFixed(2));
    p += f('58', 'BR') + f('59', clean(name, 25)) + f('60', clean(city, 15)) + f('62', f('05', txid));
    p += '6304';
    return p + crc16(p);
  };
  window.pixCrc16 = crc16;
})();
