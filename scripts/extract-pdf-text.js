const fs = require('fs');

if (!fs.existsSync('all_decompressed_streams.txt')) {
  console.error('all_decompressed_streams.txt not found');
  process.exit(1);
}

const content = fs.readFileSync('all_decompressed_streams.txt', 'utf8');

function parsePdfText(str) {
  let lines = [];
  let btBlocks = str.match(/BT[\s\S]*?ET/g);
  if (!btBlocks) return '';

  btBlocks.forEach(bt => {
    let textParts = [];
    let reg = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|")|\[([\s\S]*?)\]\s*TJ/g;
    let match;
    while ((match = reg.exec(bt)) !== null) {
      if (match[1] !== undefined) {
        textParts.push(match[1].replace(/\\([()])/g, '$1'));
      } else if (match[2] !== undefined) {
        let arrayMatches = match[2].match(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
        if (arrayMatches) {
          let word = arrayMatches.map(m => m.slice(1, -1).replace(/\\([()])/g, '$1')).join('');
          textParts.push(word);
        }
      }
    }
    if (textParts.length > 0) {
      lines.push(textParts.join(' '));
    }
  });
  return lines.join('\n');
}

let streamBlocks = content.split(/=== STREAM \d+ ===/);
let outPages = [];
streamBlocks.forEach((sb, idx) => {
  let txt = parsePdfText(sb);
  if (txt.trim().length > 20) {
    outPages.push(`==================== STREAM BLOCK ${idx} ====================\n` + txt.trim());
  }
});

console.log('Found readable text blocks:', outPages.length);
fs.writeFileSync('parsed_sanction_letter_text.txt', outPages.join('\n\n'));
console.log('Saved to parsed_sanction_letter_text.txt');
